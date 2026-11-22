// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/siyuan-community/siyuan/kernel/apicontract"
	"github.com/siyuan-community/siyuan/kernel/conf"
	"github.com/siyuan-community/siyuan/kernel/model"
	"github.com/siyuan-community/siyuan/kernel/util"
)

func TestAPIContractSyncProviderConfigRules(t *testing.T) {
	syncTestConfiguration(t)
	before := syncMarshal(t, model.Conf.Sync.Load())
	engine := gin.New()
	const path = "/api/sync/getSyncProviderConfigRules"
	engine.POST(path, getSyncProviderConfigRules)
	for _, tc := range []struct {
		body           string
		provider, code int
	}{
		{`{"provider":3,"endpoint":"https://notes.example.com"}`, conf.ProviderWebDAV, 0},
		{`{"provider":4}`, conf.ProviderLocal, 0},
		{`{"provider":0}`, 0, -1},
		{`{"provider":99}`, 99, -1},
		{`{"provider":"2"}`, 0, -1},
	} {
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest("POST", path, strings.NewReader(tc.body)))
		requireAPIContract(t, "POST", path, recorder)
		var response struct {
			Code int                                     `json:"code"`
			Data apicontract.SyncProviderConfigRulesData `json:"data"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.Code != tc.code {
			t.Fatalf("unexpected response: %s (%v)", recorder.Body.String(), err)
		}
		if tc.code == 0 && !reflect.DeepEqual(response.Data.RequiredFields, conf.SyncProviderRequiredFields(tc.provider)) {
			t.Fatalf("rules differ from kernel validation: %s", recorder.Body.String())
		}
	}
	if string(before) != string(syncMarshal(t, model.Conf.Sync.Load())) {
		t.Fatal("rule requests changed the saved configuration")
	}
}

func TestAPIContractSyncProviderWebDAVAndLocalProbe(t *testing.T) {
	syncTestConfiguration(t)
	previousLangs := util.Langs
	util.Langs = map[string]map[int]string{"en": {142: "Input cannot be empty", 77: "Invalid directory [%s]", 249: "Invalid address"}}
	t.Cleanup(func() { util.Langs = previousLangs })
	before := syncMarshal(t, model.Conf.Sync.Load())
	engine := gin.New()
	engine.POST("/api/sync/testSyncProviderWebDAV", testSyncProviderWebDAV)
	engine.POST("/api/sync/testSyncProviderLocal", testSyncProviderLocal)
	root := t.TempDir()
	localBody, err := json.Marshal(map[string]interface{}{"local": map[string]string{"endpoint": root}})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path, body, kind string
		code             int
	}{
		{"testSyncProviderWebDAV", `{"webdav":{}}`, model.SyncProbeConfig, 0},
		{"testSyncProviderWebDAV", `{"webdav":{"endpoint":"ftp://invalid"}}`, model.SyncProbeConfig, 0},
		{"testSyncProviderWebDAV", `{"webdav":{"timeout":"bad"}}`, "", -1},
		{"testSyncProviderLocal", `{"local":{}}`, model.SyncProbeConfig, 0},
		{"testSyncProviderLocal", `{"local":{"endpoint":false}}`, "", -1},
		{"testSyncProviderLocal", string(localBody), model.SyncProbeOK, 0},
	} {
		path := "/api/sync/" + tc.path
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest("POST", path, strings.NewReader(tc.body)))
		requireAPIContract(t, "POST", path, recorder)
		var response struct {
			Code int
			Data apicontract.TestSyncProviderData
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.Code != tc.code || (tc.code == 0 && response.Data.Kind != tc.kind) {
			t.Fatalf("unexpected response: %s (%v)", recorder.Body.String(), err)
		}
	}
	if string(before) != string(syncMarshal(t, model.Conf.Sync.Load())) {
		t.Fatal("probe changed saved configuration")
	}
	entries, err := os.ReadDir(filepath.Clean(root))
	if err != nil || len(entries) != 0 {
		t.Fatalf("probe not cleaned: %v %v", entries, err)
	}
}
