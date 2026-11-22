// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"context"
	"slices"
	"testing"

	"github.com/siyuan-community/siyuan/kernel/bazaar"
)

func TestGetInstalledBazaarPackageRatingsFiltersOfficialPackages(t *testing.T) {
	oldInstalledPackageInfos := bazaarRatingInstalledPackageInfos
	oldExistingPackageNames := bazaarRatingExistingPackageNames
	oldPublicPackageRatings := bazaarRatingPublicPackageRatings
	t.Cleanup(func() {
		bazaarRatingInstalledPackageInfos = oldInstalledPackageInfos
		bazaarRatingExistingPackageNames = oldExistingPackageNames
		bazaarRatingPublicPackageRatings = oldPublicPackageRatings
	})

	bazaarRatingInstalledPackageInfos = func(string) ([]installedPackageInfo, string, string, error) {
		return []installedPackageInfo{
			{Pkg: &bazaar.Package{Name: "official-zero"}},
			{Pkg: &bazaar.Package{Name: "local-zip"}},
			{Pkg: &bazaar.Package{Name: "invalid", InvalidReason: bazaar.PackageInvalidReasonInvalidManifest}},
		}, "", "", nil
	}
	bazaarRatingExistingPackageNames = func(_ context.Context, pkgType string, packageNames []string) ([]string, error) {
		if "plugins" != pkgType {
			t.Fatalf("unexpected package type: %s", pkgType)
		}
		if want := []string{"official-zero", "local-zip"}; !slices.Equal(want, packageNames) {
			t.Fatalf("unexpected installed package names: %v", packageNames)
		}
		return []string{"official-zero"}, nil
	}
	bazaarRatingPublicPackageRatings = func(_ context.Context,
		packageNames []string) (map[string]*bazaar.PackageRating, bool) {
		if want := []string{"official-zero"}; !slices.Equal(want, packageNames) {
			t.Fatalf("unexpected eligible package names: %v", packageNames)
		}
		return map[string]*bazaar.PackageRating{}, true
	}

	ratings, eligiblePackageNames, err := GetInstalledBazaarPackageRatings(context.Background(), "plugins",
		[]string{"official-zero", "local-zip", "invalid", "missing", "official-zero"})
	if nil != err {
		t.Fatal(err)
	}
	if 0 != len(ratings) {
		t.Fatalf("zero-rating official package should not create a rating: %+v", ratings)
	}
	if want := []string{"official-zero"}; !slices.Equal(want, eligiblePackageNames) {
		t.Fatalf("unexpected eligible package names: %v", eligiblePackageNames)
	}
}

func TestGetInstalledBazaarPackageRatingsSkipsRatingsWithoutEligiblePackages(t *testing.T) {
	oldInstalledPackageInfos := bazaarRatingInstalledPackageInfos
	oldExistingPackageNames := bazaarRatingExistingPackageNames
	oldPublicPackageRatings := bazaarRatingPublicPackageRatings
	t.Cleanup(func() {
		bazaarRatingInstalledPackageInfos = oldInstalledPackageInfos
		bazaarRatingExistingPackageNames = oldExistingPackageNames
		bazaarRatingPublicPackageRatings = oldPublicPackageRatings
	})

	bazaarRatingInstalledPackageInfos = func(string) ([]installedPackageInfo, string, string, error) {
		return []installedPackageInfo{{Pkg: &bazaar.Package{Name: "local-zip"}}}, "", "", nil
	}
	bazaarRatingExistingPackageNames = func(context.Context, string, []string) ([]string, error) {
		return []string{}, nil
	}
	bazaarRatingPublicPackageRatings = func(context.Context,
		[]string) (map[string]*bazaar.PackageRating, bool) {
		t.Fatal("public ratings should not load when no requested package is eligible")
		return nil, false
	}

	ratings, eligiblePackageNames, err := GetInstalledBazaarPackageRatings(context.Background(), "plugins",
		[]string{"local-zip"})
	if nil != err || 0 != len(ratings) || 0 != len(eligiblePackageNames) {
		t.Fatalf("unexpected ineligible-only result: ratings=%v eligible=%v err=%v",
			ratings, eligiblePackageNames, err)
	}
}
