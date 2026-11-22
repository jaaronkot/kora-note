// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package apicontract

import (
	"encoding/json"
	"testing"
)

func TestBazaarResponseVariants(t *testing.T) {
	bundle, err := BuildBundle()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		path string
		body string
	}{
		{"installLocalBazaarPackage", `{"code":0,"msg":"","data":{"packageType":"plugins","packageName":"name","updated":false}}`},
		{"installLocalBazaarPackage", `{"code":1,"msg":"exists","data":{"reason":"package-exists","packageType":"plugins","packageName":"name","minAppVersion":""}}`},
	} {
		if err := bundle.ValidateResponse("POST", "/api/bazaar/"+test.path, []byte(test.body)); err != nil {
			t.Errorf("%s: %v", test.body, err)
		}
	}
}

func TestBazaarContractOptionalListingMetadata(t *testing.T) {
	bundle, err := BuildBundle()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name   string
		fields map[string]any
		valid  bool
	}{
		{name: "omitted", valid: true},
		{name: "known", fields: map[string]any{"created": "2026-11-01T12:34:56Z", "bazaarVersionUnsupported": true}, valid: true},
		{name: "explicit empty and false", fields: map[string]any{"created": "", "bazaarVersionUnsupported": false}, valid: true},
		{name: "null created", fields: map[string]any{"created": nil}},
		{name: "numeric created", fields: map[string]any{"created": 1234}},
		{name: "null version compatibility", fields: map[string]any{"bazaarVersionUnsupported": nil}},
		{name: "string version compatibility", fields: map[string]any{"bazaarVersionUnsupported": "true"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			data, err := json.Marshal(BazaarPackage{})
			if err != nil {
				t.Fatal(err)
			}
			var pkg map[string]any
			if err = json.Unmarshal(data, &pkg); err != nil {
				t.Fatal(err)
			}
			for key, value := range test.fields {
				pkg[key] = value
			}
			for _, endpoint := range []string{"getBazaarPlugin", "getBazaarTheme", "getBazaarWidget", "getBazaarIcon", "getBazaarTemplate", "updateBazaarPackage"} {
				data, err = json.Marshal(map[string]any{"code": 0, "msg": "", "data": map[string]any{"packages": []any{pkg}}})
				if err != nil {
					t.Fatal(err)
				}
				if err = bundle.ValidateResponse("POST", "/api/bazaar/"+endpoint, data); (err == nil) != test.valid {
					t.Fatalf("%s: unexpected validation result %v for %s", endpoint, err, data)
				}
			}
		})
	}
}
