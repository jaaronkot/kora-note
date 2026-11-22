// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/siyuan-community/siyuan/kernel/apicontract"
	"github.com/siyuan-community/siyuan/kernel/conf"
	"github.com/siyuan-community/siyuan/kernel/model"
	"github.com/siyuan-community/siyuan/kernel/util"
)

func TestAPIContractSyncClearConfiguration(t *testing.T) {
	syncTestConfiguration(t)
	previousDir, previousRepo, previousData := util.ConfDir, util.RepoDir, util.DataDir
	t.Cleanup(func() { util.ConfDir, util.RepoDir, util.DataDir = previousDir, previousRepo, previousData })
	util.ConfDir = t.TempDir()
	util.RepoDir, util.DataDir = filepath.Join(util.ConfDir, "repo"), filepath.Join(util.ConfDir, "data")
	util.ReadOnly = false
	engine := gin.New()
	const path = "/api/sync/clearSyncProviderConfig"
	engine.POST(path, clearSyncProviderConfig)
	for _, body := range []string{`{}`, `{"provider":null}`, `{"provider":"2"}`, `{"provider":2.5}`, `{"provider":0}`, `{"provider":5}`, `{"provider":3}`} {
		model.Conf.Sync.Load().Provider, model.Conf.Sync.Load().Enabled = conf.ProviderWebDAV, true
		model.Conf.Sync.Load().WebDAV = &conf.WebDAV{Endpoint: "https://dav.example", Password: "secret"}
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest("POST", path, strings.NewReader(body)))
		requireAPIContract(t, "POST", path, recorder)
		var response struct {
			Code int                                      `json:"code"`
			Data *apicontract.ClearSyncProviderConfigData `json:"data"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if body == `{"provider":3}` {
			if response.Code != 0 || response.Data == nil || response.Data.Enabled || response.Data.WebDAV == nil || response.Data.WebDAV.Password != "" {
				t.Fatalf("clear response: %s", recorder.Body.String())
			}
		} else if response.Code == 0 || model.Conf.Sync.Load().WebDAV.Password != "secret" || !model.Conf.Sync.Load().Enabled {
			t.Fatalf("invalid clear changed configuration: %s", recorder.Body.String())
		}
	}
}
