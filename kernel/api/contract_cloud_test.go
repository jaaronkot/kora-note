// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"encoding/json"
	"github.com/siyuan-community/siyuan/kernel/model"
	"testing"
)

func TestAPIContractCloudPayloads(t *testing.T) {
	for _, value := range []*model.Sync{nil, {}, {Size: 12345, HSize: "12 KB", Updated: "date", CloudName: "cloud", SaveDir: "local"}} {
		before, _ := json.Marshal(value)
		after, err := json.Marshal(cloudSyncContract(value))
		if err != nil || string(before) != string(after) {
			t.Fatalf("sync payload changed: %s != %s, %v", before, after, err)
		}
	}
	for _, value := range []*model.Backup{nil, {}, {Size: 12345, HSize: "12 KB", Updated: "date", SaveDir: "local"}} {
		before, _ := json.Marshal(value)
		after, err := json.Marshal(cloudBackupContract(value))
		if err != nil || string(before) != string(after) {
			t.Fatalf("backup payload changed: %s != %s, %v", before, after, err)
		}
	}
}
