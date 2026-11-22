// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"fmt"
	"testing"

	"github.com/siyuan-community/siyuan/kernel/conf"
)

func TestLANSyncScopePreservesOtherProviders(t *testing.T) {
	prepareSyncDirectoryTest(t)
	Conf.Sync.Load().WebDAV = &conf.WebDAV{Endpoint: "https://dav.example.com"}
	Conf.Sync.Load().Local = &conf.Local{Endpoint: "local-sync"}
	for _, tc := range []struct {
		provider int
		suffix   string
	}{
		{conf.ProviderWebDAV, "https://dav.example.com"},
		{conf.ProviderLocal, "local-sync"},
	} {
		Conf.Sync.Load().Provider = tc.provider
		for _, name := range []string{"main", "work"} {
			Conf.Sync.Load().CloudName = name
			want := fmt.Sprintf("v1:%d:%s:%s", tc.provider, name, tc.suffix)
			if got := lanSyncScope(); got != want {
				t.Fatalf("provider %d scope changed: got %q, want %q", tc.provider, got, want)
			}
		}
	}
}
