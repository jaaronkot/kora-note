// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"encoding/json"
	"net"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
	"github.com/siyuan-community/siyuan/kernel/apicontract"
	"github.com/siyuan-community/siyuan/kernel/model"
	"github.com/siyuan-community/siyuan/kernel/util"
)

// connectSettingNotifications 建立 main 会话并返回可读取推送的连接，供各设置通知测试共用。
func connectSettingNotifications(t *testing.T, engine *gin.Engine) *websocket.Conn {
	t.Helper()
	push := melody.New()
	connected := make(chan *melody.Session, 1)
	push.HandleConnect(func(session *melody.Session) {
		util.AddPushChan(session)
		connected <- session
	})
	push.HandleDisconnect(util.RemovePushChan)
	engine.GET("/ws", func(c *gin.Context) { _ = push.HandleRequest(c.Writer, c.Request) })
	server := httptest.NewServer(engine)
	t.Cleanup(func() { push.Close(); server.Close() })
	endpoint := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?app=" + t.Name() + "&id=settings-notifications&type=main"
	connection, response, err := websocket.DefaultDialer.Dial(endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	t.Cleanup(func() { connection.Close() })
	select {
	case session := <-connected:
		t.Cleanup(func() { util.RemovePushChan(session) })
	case <-time.After(5 * time.Second):
		t.Fatal("settings WebSocket did not connect")
	}
	return connection
}

// settingReadAction 匹配读取类端点的动作名。这类端点即使顺带写入配置，也由配置段发布通知，
// 包装层再补一次只会在内容未变化时产生多余广播。
var settingReadAction = regexp.MustCompile(`^/(get|list|search|query)[A-Z]`)

// 通知会让客户端按命名空间读取配置段，因此只有能读取的命名空间才允许广播。
func TestSettingNotificationsTargetReadableSections(t *testing.T) {
	previousConf := model.Conf
	model.Conf = model.NewAppConf()
	t.Cleanup(func() { model.Conf = previousConf })
	for _, definition := range apicontract.Definitions() {
		setting := definition.Setting
		if !setting.Declared() || setting.Mode != apicontract.SettingNotify {
			continue
		}
		if settingReadAction.MatchString(definition.Path[strings.LastIndex(definition.Path, "/"):]) {
			t.Errorf("%s is a read action but publishes settingChanged", definition.Path)
		}
		if "*" == setting.Namespace {
			continue
		}
		if _, ok := model.SectionSpecByNamespace(setting.Namespace); !ok {
			t.Errorf("%s notifies %q, which no client can read as a configuration section", definition.Path, setting.Namespace)
		}
	}
}

// 独立存储不是 conf.json 的配置段，写入后不得向客户端广播 settingChanged。
func TestSettingStorageWritesDoNotPublishNotifications(t *testing.T) {
	previousConf, previousReadOnly, previousConfDir, previousDataDir := model.Conf, util.ReadOnly, util.ConfDir, util.DataDir
	util.ReadOnly, util.ConfDir, util.DataDir = false, t.TempDir(), t.TempDir()
	t.Cleanup(func() {
		model.Conf, util.ReadOnly, util.ConfDir, util.DataDir = previousConf, previousReadOnly, previousConfDir, previousDataDir
	})
	model.Conf = model.NewAppConf()
	model.NormalizeAppConf(model.Conf)

	engine := gin.New()
	engine.POST("/api/storage/setOutlineStorage", setOutlineStorage)
	engine.POST("/api/notebook/setNotebookCryptoAutoLock", setNotebookCryptoAutoLock)
	connection := connectSettingNotifications(t, engine)
	for _, request := range []struct{ path, body string }{
		{"/api/storage/setOutlineStorage", `{"docID":"20260820000000-outline","val":{"expandIds":["20260820000000-heading"]}}`},
		{"/api/notebook/setNotebookCryptoAutoLock", `{"autoLockMinutes":15}`},
	} {
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest("POST", request.path, strings.NewReader(request.body)))
		requireAPIContract(t, "POST", request.path, recorder)
		var response struct{ Code int }
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.Code != 0 {
			t.Fatalf("%s failed: %s (%v)", request.path, recorder.Body.String(), err)
		}
	}
	// 保存会顺带触发同步排期等其他推送，这里只关心是否出现了配置段变更通知。
	deadline := time.Now().Add(time.Second)
	for {
		if err := connection.SetReadDeadline(deadline); err != nil {
			t.Fatal(err)
		}
		var event struct {
			Cmd  string          `json:"cmd"`
			Data json.RawMessage `json:"data"`
		}
		if err := connection.ReadJSON(&event); err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				return
			}
			t.Fatalf("read push failed: %v", err)
		}
		if "settingChanged" == event.Cmd {
			var data struct {
				Namespace string `json:"namespace"`
			}
			_ = json.Unmarshal(event.Data, &data)
			t.Fatalf("storage write published a setting notification for %q", data.Namespace)
		}
	}
}
