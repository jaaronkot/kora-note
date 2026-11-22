// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"testing"

	"github.com/siyuan-community/siyuan/kernel/conf"
)

// 以下默认值取决于 conf.json 是否存在：新工作空间使用构造函数默认值，已有工作空间缺少字段时沿用旧默认值。
func TestNormalizeFileTreeDefaultIcon(t *testing.T) {
	for _, test := range []struct {
		name           string
		fileTree       *conf.FileTree
		confFileExists bool
		want           bool
	}{
		{name: "new workspace", want: true},
		{name: "existing workspace without file tree", confFileExists: true},
		{name: "existing setting enabled", fileTree: &conf.FileTree{UseSVGDefaultIcon: true}, confFileExists: true, want: true},
		{name: "existing setting disabled", fileTree: &conf.FileTree{UseSVGDefaultIcon: false}, confFileExists: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			fileTree := normalizeFileTreeDefaultIcon(test.fileTree, test.confFileExists)
			if test.want != fileTree.UseSVGDefaultIcon {
				t.Fatalf("unexpected default icon setting: got %t, want %t", fileTree.UseSVGDefaultIcon, test.want)
			}
		})
	}
}
