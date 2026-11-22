// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package conf

import (
	"strings"
)

// SyncProviderRequiredFields 是表单提示和内核保存校验共用的必填字段清单。
func SyncProviderRequiredFields(provider int) []string {
	switch provider {
	case ProviderWebDAV, ProviderLocal:
		return []string{"endpoint"}
	default:
		return []string{}
	}
}

// MissingSyncProviderField 检查原始字段值，避免归一化掩盖空白输入。
func MissingSyncProviderField(provider int, values map[string]string) bool {
	for _, key := range SyncProviderRequiredFields(provider) {
		if strings.TrimSpace(values[key]) == "" {
			return true
		}
	}
	return false
}
