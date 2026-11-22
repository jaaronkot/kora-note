// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"bytes"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/88250/lute"
	"github.com/88250/lute/ast"
	"github.com/88250/lute/parse"
	"github.com/gabriel-vasile/mimetype"
	"github.com/gin-gonic/gin"
	"github.com/siyuan-community/siyuan/kernel/apicontract"
	"github.com/siyuan-community/siyuan/kernel/model"
	"github.com/siyuan-community/siyuan/kernel/util"
	"github.com/siyuan-note/logging"
)

var extensionIframePattern = regexp.MustCompile(`(?i)<iframe[^>]*>([\s\S]*?)<\/iframe>`)

var extensionCopy = contractHandler(apicontract.ExtensionCopy, func(c *gin.Context, request apicontract.ExtensionCopyRequest) apicontract.Response[*apicontract.ExtensionCopyData] {
	code := 0
	dom := request.DOM
	assets := filepath.Join(util.DataDir, "assets")
	targetBoxID := ""
	encryptedBoxID := ""
	if request.Notebook != nil {
		nb := *request.Notebook
		if ast.IsNodeIDPattern(nb) {
			targetBoxID = nb
			assets = model.GetImportAssetsDir(targetBoxID, "")
			if model.IsEncryptedBox(targetBoxID) {
				encryptedBoxID = targetBoxID
			}
		}
	}
	if err := holdEncryptedBoxRequest(c, encryptedBoxID); err != nil {
		return apicontract.Failure[*apicontract.ExtensionCopyData](-1, err.Error())
	}

	if err := os.MkdirAll(assets, 0755); err != nil {
		logging.LogErrorf("create assets folder [%s] failed: %s", assets, err)
		return apicontract.SuccessWithMessage((*apicontract.ExtensionCopyData)(nil), err.Error())
	}

	uploaded := map[string]string{}
	for originalName, file := range request.Files {
		oName, err := url.PathUnescape(originalName)
		unescaped := oName

		if err != nil {
			if strings.Contains(originalName, "%u") {
				originalName = strings.ReplaceAll(originalName, "%u", "\\u")
				originalName, err = strconv.Unquote("\"" + originalName + "\"")
				if err != nil {
					continue
				}
				oName, err = url.PathUnescape(originalName)
				if err != nil {
					continue
				}
			} else {
				continue
			}
		}
		if strings.Contains(oName, "%") {
			unescaped, _ := url.PathUnescape(oName)
			if "" != unescaped {
				oName = unescaped
			}
		}

		u, _ := url.Parse(oName)
		if nil == u {
			continue
		}
		if "" == u.Path {
			continue
		}
		fName := path.Base(u.Path)

		f, err := file[0].Open()
		if err != nil {
			code = -1
			break
		}

		data, err := io.ReadAll(f)
		if err != nil {
			code = -1
			break
		}

		fName = util.FilterUploadFileName(fName)
		ext := util.Ext(fName)
		if !util.IsCommonExt(ext) || strings.Contains(ext, "!") {
			// 改进浏览器剪藏扩展转换本地图片后缀 https://github.com/siyuan-note/siyuan/issues/7467 https://github.com/siyuan-note/siyuan/issues/15320
			if mtype := mimetype.Detect(data); nil != mtype {
				ext = mtype.Extension()
				fName += ext
			}
		}
		if "" == ext && bytes.HasPrefix(data, []byte("<svg ")) && bytes.HasSuffix(data, []byte("</svg>")) {
			ext = ".svg"
			fName += ext
		}

		// 统一通过 storeAssetForBox 写入，加密 box 自动脱敏 + 加密落盘 + 追加 ?box=
		storedName, storeErr := model.StoreAssetForBox(targetBoxID, assets, fName, data)
		if storeErr != nil {
			code = -1
			break
		}

		assetURL := "assets/" + storedName
		if encryptedBoxID != "" {
			assetURL += "?box=" + encryptedBoxID
		}
		uploaded[unescaped] = assetURL
	}

	luteEngine := util.NewLute()
	luteEngine.SetHTMLTag2TextMark(true)
	var withMath bool

	// 通过正则将 <iframe>.*</iframe> 标签中间包含的换行去掉
	dom = extensionIframePattern.ReplaceAllStringFunc(dom, func(s string) string {
		s = strings.ReplaceAll(s, "\n", "")
		s = strings.ReplaceAll(s, "\r", "")
		return s
	})

	tree, withMath := model.HTML2Tree(dom, luteEngine, targetBoxID)

	var unlinks []*ast.Node
	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering {
			return ast.WalkContinue
		}

		if ast.NodeText == n.Type {
			if ast.NodeParagraph == n.Parent.Type && n.Parent.FirstChild == n {
				n.Tokens = bytes.TrimLeft(n.Tokens, " \t\n")
			}
		} else if ast.NodeImage == n.Type {
			if dest := n.ChildByType(ast.NodeLinkDest); nil != dest {
				assetPath := uploaded[string(dest.Tokens)]
				if "" == assetPath {
					assetPath = uploaded[string(dest.Tokens)+"?imageView2/2/interlace/1/format/webp"]
				}
				if "" != assetPath {
					dest.Tokens = []byte(assetPath)
				}

				// 检测 alt 和 title 格式，如果不是文本的话转换为文本 https://github.com/siyuan-note/siyuan/issues/14233
				if linkText := n.ChildByType(ast.NodeLinkText); nil != linkText {
					if inlineTree := parse.Inline("", linkText.Tokens, luteEngine.ParseOptions); nil != inlineTree && nil != inlineTree.Root && nil != inlineTree.Root.FirstChild {
						if fc := inlineTree.Root.FirstChild.FirstChild; nil != fc {
							if ast.NodeText != fc.Type {
								linkText.Tokens = []byte(fc.Text())
							}
						}
					}
				}
				if title := n.ChildByType(ast.NodeLinkTitle); nil != title {
					if inlineTree := parse.Inline("", title.Tokens, luteEngine.ParseOptions); nil != inlineTree && nil != inlineTree.Root && nil != inlineTree.Root.FirstChild {
						if fc := inlineTree.Root.FirstChild.FirstChild; nil != fc {
							if ast.NodeText != fc.Type {
								title.Tokens = []byte(fc.Text())
							}
						}
					}
				}
			}
		}
		return ast.WalkContinue
	})
	for _, unlink := range unlinks {
		unlink.Unlink()
	}

	parse.TextMarks2Inlines(tree) // 先将 TextMark 转换为 Inlines https://github.com/siyuan-note/siyuan/issues/13056
	parse.NestedInlines2FlattedSpansHybrid(tree, false)

	md, _ := lute.FormatNodeSync(tree.Root, luteEngine.ParseOptions, luteEngine.RenderOptions)
	data := &apicontract.ExtensionCopyData{Markdown: md, WithMath: withMath}
	message := model.Conf.Language(72)
	if code != 0 {
		return apicontract.ExtensionCopy.FailureWithData(code, message, data)
	}
	return apicontract.SuccessWithMessage(data, message)
})
