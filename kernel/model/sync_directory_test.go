// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/siyuan-community/siyuan/kernel/conf"
	"github.com/siyuan-community/siyuan/kernel/util"
)

func prepareSyncDirectoryTest(t *testing.T) {
	t.Helper()
	originalConf := Conf
	originalData, originalRepo, originalConfDir := util.DataDir, util.RepoDir, util.ConfDir
	originalHistory, originalTemp := util.HistoryDir, util.TempDir
	t.Cleanup(func() {
		Conf = originalConf
		util.DataDir, util.RepoDir, util.ConfDir = originalData, originalRepo, originalConfDir
		util.HistoryDir, util.TempDir = originalHistory, originalTemp
	})
	base := t.TempDir()
	util.DataDir, util.RepoDir, util.ConfDir = filepath.Join(base, "data"), filepath.Join(base, "repo"), filepath.Join(base, "conf")
	util.HistoryDir, util.TempDir = filepath.Join(base, "history"), filepath.Join(base, "temp")
	if err := os.MkdirAll(util.ConfDir, 0755); err != nil {
		t.Fatal(err)
	}
	Conf = NewAppConf()
	{
		confSectionValue0, confSectionValue1, confSectionValue2 := conf.NewSync(), conf.NewRepo(), conf.NewSystem()
		Conf.Sync.Store(confSectionValue0)
		Conf.Repo.Store(confSectionValue1)
		Conf.System.Store(confSectionValue2)
	}
	Conf.Sync.Load().Provider = conf.ProviderWebDAV
	Conf.Sync.Load().WebDAV = &conf.WebDAV{Endpoint: "https://dav.example", Username: "name", Password: "password"}
	Conf.Repo.Load().Key = []byte("0123456789abcdef0123456789abcdef")
}
