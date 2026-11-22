// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package conf

import "testing"

func TestSyncProviderRequiredFields(t *testing.T) {
	values := map[string]string{"endpoint": "example.com"}
	for _, provider := range []int{ProviderWebDAV, ProviderLocal} {
		if MissingSyncProviderField(provider, values) {
			t.Fatal("complete configuration was rejected")
		}
		for _, key := range SyncProviderRequiredFields(provider) {
			original := values[key]
			values[key] = " \t\n "
			if !MissingSyncProviderField(provider, values) {
				t.Fatalf("provider %d did not enforce advertised field %s", provider, key)
			}
			values[key] = original
		}
	}
	if MissingSyncProviderField(ProviderWebDAV, map[string]string{"endpoint": "example.com"}) {
		t.Fatal("anonymous WebDAV was rejected")
	}
}
