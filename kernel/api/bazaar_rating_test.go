// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/88250/gulu"
	"github.com/gin-gonic/gin"
	"github.com/siyuan-community/siyuan/kernel/bazaar"
)

func TestGetBazaarPackageRatingsRequiresPackageNames(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/rating", getBazaarPackageRatings)

	body, err := json.Marshal(map[string]any{"packageType": "plugins"})
	if nil != err {
		t.Fatal(err)
	}
	response := performBazaarRatingRequest(t, engine, body)
	if 0 == response.Code {
		t.Fatal("missing packageNames should be rejected")
	}
}

func TestBazaarPackageRatingsResponseEligibility(t *testing.T) {
	rating := &bazaar.PackageRating{Average: 5, Count: 1, Distribution: [5]int64{0, 0, 0, 0, 1}}
	data := bazaarPackageRatingsResponseData(map[string]*bazaar.PackageRating{"rated": rating},
		[]string{"rated", "official-zero"})
	ratings, ok := data["ratings"].(map[string]*bazaar.PackageRating)
	if !ok || ratings["rated"] != rating {
		t.Fatalf("unexpected ratings: %+v", data["ratings"])
	}
	eligiblePackageNames, ok := data["eligiblePackageNames"].([]string)
	if !ok || !slices.Equal([]string{"rated", "official-zero"}, eligiblePackageNames) {
		t.Fatalf("unexpected eligible package names: %+v", data["eligiblePackageNames"])
	}
}

func performBazaarRatingRequest(t *testing.T, engine *gin.Engine, body []byte) *gulu.Result {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/rating", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(recorder, request)
	result := gulu.Ret.NewResult()
	if err := json.Unmarshal(recorder.Body.Bytes(), result); nil != err {
		t.Fatal(err)
	}
	return result
}
