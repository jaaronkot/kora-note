// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package util

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestNativeEmojiCacheReplacementAndConcurrentReads(t *testing.T) {
	oldAppearance := AppearancePath
	nativeEmojiCharsLock.RLock()
	oldChars := nativeEmojiChars
	nativeEmojiCharsLock.RUnlock()
	AppearancePath = t.TempDir()
	t.Cleanup(func() {
		AppearancePath = oldAppearance
		nativeEmojiCharsLock.Lock()
		nativeEmojiChars = oldChars
		nativeEmojiCharsLock.Unlock()
	})
	directory := filepath.Join(AppearancePath, "emojis")
	if err := os.MkdirAll(directory, 0755); err != nil {
		t.Fatal(err)
	}
	write := func(value string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(directory, "conf.json"), []byte(value), 0644); err != nil {
			t.Fatal(err)
		}
		InitEmojiChars()
	}
	write(`[{"items":[{"unicode":"old"}]}]`)
	if !IsNativeEmoji("old") {
		t.Fatal("emoji list was not loaded")
	}
	write(`[{"items":[{"unicode":"new"}]}]`)
	if IsNativeEmoji("old") || !IsNativeEmoji("new") {
		t.Fatal("emoji refresh retained removed entries")
	}
	write(`invalid`)
	if !IsNativeEmoji("new") {
		t.Fatal("failed refresh discarded the last valid emoji list")
	}
	write(`[{"items":[{"unicode":"new"}]}]`)
	var group sync.WaitGroup
	for range 8 {
		group.Go(func() {
			for range 50 {
				InitEmojiChars()
				if !IsNativeEmoji("new") || IsNativeEmoji("old") {
					t.Error("concurrent refresh changed emoji membership")
					return
				}
			}
		})
	}
	group.Wait()
}
