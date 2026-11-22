// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"context"
	"errors"
	"fmt"

	"github.com/siyuan-community/siyuan/kernel/bazaar"
)

var (
	bazaarRatingInstalledPackageInfos = GetInstalledPackageInfos
	bazaarRatingExistingPackageNames  = bazaar.GetExistingBazaarPackageNames
	bazaarRatingPublicPackageRatings  = bazaar.GetBazaarPackageRatings
)

// GetInstalledBazaarPackageRatings 获取指定已安装包的公开评分。
func GetInstalledBazaarPackageRatings(ctx context.Context, pkgType string,
	packageNames []string) (ratings map[string]*bazaar.PackageRating, eligiblePackageNames []string, err error) {
	eligiblePackageNames, err = getInstalledOfficialBazaarPackageNames(ctx, pkgType, packageNames)
	if nil != err {
		return nil, nil, err
	}
	if 0 == len(eligiblePackageNames) {
		return map[string]*bazaar.PackageRating{}, []string{}, nil
	}
	ratings, available := bazaarRatingPublicPackageRatings(ctx, eligiblePackageNames)
	if !available {
		return nil, nil, errors.New("marketplace package ratings are unavailable")
	}
	return ratings, eligiblePackageNames, nil
}

func getInstalledOfficialBazaarPackageNames(ctx context.Context, pkgType string,
	packageNames []string) ([]string, error) {
	if !isValidBazaarPackageType(pkgType) {
		return nil, errors.New("invalid package type")
	}
	installedInfos, _, _, err := bazaarRatingInstalledPackageInfos(pkgType)
	if nil != err {
		return nil, err
	}
	installed := make(map[string]bool, len(installedInfos))
	for _, info := range installedInfos {
		if "" == info.Pkg.InvalidReason {
			installed[info.Pkg.Name] = true
		}
	}

	names := make([]string, 0, len(packageNames))
	seen := make(map[string]bool, len(packageNames))
	for _, packageName := range packageNames {
		if !bazaar.IsValidPackageName(packageName) {
			return nil, fmt.Errorf("invalid package name: %s", packageName)
		}
		if !installed[packageName] || seen[packageName] {
			continue
		}
		seen[packageName] = true
		names = append(names, packageName)
	}
	if 0 == len(names) {
		return []string{}, nil
	}
	return bazaarRatingExistingPackageNames(ctx, pkgType, names)
}

func isValidBazaarPackageType(pkgType string) bool {
	switch pkgType {
	case "plugins", "widgets", "icons", "templates", "themes":
		return true
	default:
		return false
	}
}
