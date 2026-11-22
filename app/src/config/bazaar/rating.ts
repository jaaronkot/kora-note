import {fetchPost} from "../../util/fetch";
import {escapeAttr, escapeHtml} from "../../util/escape";
import {
    applyBazaarPackageRatingToItem,
    beginBazaarRatingRequest,
    getBazaarRatingMutationVersion,
    getDisplayableBazaarRating,
    isBazaarPackageRatingLoaded,
    isBazaarRatingMutationVersionCurrent,
    normalizeBazaarPackageRatingResponse,
    normalizeBazaarPackageRatingsResponse,
    sortBazaarPackages,
} from "../../util/bazaarPackage";
import {BAZAAR_PACKAGE_TYPES} from "./packageConfig";

type TBazaarController = typeof import("../bazaar").bazaar;

export const getRatingKey = (bazaarType: TBazaarType, packageName: string) => {
    return `${bazaarType}:${packageName}`;
};

export const getRatingSummaryText = (rating?: IBazaarRating) => {
    const normalized = getDisplayableBazaarRating(rating);
    if (!normalized) {
        return window.siyuan.languages.bazaarNoRatings;
    }
    return window.siyuan.languages.bazaarRatingSummary
        .replace("${average}", normalized.average.toLocaleString(undefined, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        }))
        .replace("${count}", normalized.count.toLocaleString());
};

export const genRatingStarsHTML = (value: number) => {
    const activePercentage = Math.max(0, Math.min(100, value / 5 * 100));
    const inactiveStars = Array.from({length: 5}, () => '<svg class="config-bazaar__rating-star config-bazaar__rating-star--outline"><use xlink:href="#iconStar"></use></svg>').join("");
    const activeStars = Array.from({length: 5}, () => '<svg class="config-bazaar__rating-star"><use xlink:href="#iconStar"></use></svg>').join("");
    return `<span class="config-bazaar__rating-stars" aria-hidden="true">
${inactiveStars}
<span class="config-bazaar__rating-stars--active" style="width: ${activePercentage}%">${activeStars}</span>
</span>`;
};

export const genCardRatingHTML = (item: Pick<IBazaarItem, "rating">, loaded = true) => {
    const rating = getDisplayableBazaarRating(item.rating);
    const hidden = !loaded || !rating;
    const summary = getRatingSummaryText(rating);
    const average = rating?.average.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });
    return `<span data-rating-card-slot data-position="north" class="ariaLabel block__icon block__icon--show block__icon--text${hidden ? " fn__none" : ""}" aria-label="${escapeAttr(summary)}">
<svg aria-hidden="true"><use xlink:href="#iconStar"></use></svg>
<span class="fn__space--small"></span>
<span>${escapeHtml(average || "")}</span>
</span>`;
};

export const genRatingDistributionHTML = (rating?: IBazaarRating) => {
    const normalized = getDisplayableBazaarRating(rating);
    return [5, 4, 3, 2, 1].map((star) => {
        const count = normalized?.distribution[star - 1] || 0;
        const ratio = normalized ? Math.min(1, count / normalized.count) : 0;
        const percentage = ratio * 100;
        const percentageText = new Intl.NumberFormat(undefined, {
            style: "percent",
            maximumFractionDigits: 0,
        }).format(ratio);
        const label = window.siyuan.languages.bazaarRatingDistributionLabel
            .replace("${star}", star.toString())
            .replace("${count}", count.toLocaleString());
        return `<div class="config-bazaar__rating-row" aria-label="${escapeAttr(`${label} ${percentageText}`)}">
<span>${star}</span>
<svg class="config-bazaar__rating-star" aria-hidden="true"><use xlink:href="#iconStar"></use></svg>
<span class="config-bazaar__rating-track" aria-hidden="true"><span style="width: ${percentage}%"></span></span>
<span>${escapeHtml(percentageText)}</span>
<span>${count.toLocaleString()}</span>
</div>`;
    }).join("");
};

export const genReadmeRatingHTML = (controller: TBazaarController, bazaarType: TBazaarType, item: IBazaarItem, loaded: boolean) => {
    if (!loaded) {
        return "";
    }
    const rating = getDisplayableBazaarRating(item.rating);
    const action = item.installed ? "" :
        `<div class="config-bazaar__rating-tip">${window.siyuan.languages.bazaarRatingInstallTip}</div>`;
    const summary = rating ? getRatingSummaryText(rating) : "";
    const aggregate = rating ? `<div class="config-bazaar__rating-summary" aria-label="${escapeAttr(summary)}">
    ${genRatingStarsHTML(rating.average)}
    <span>${escapeHtml(summary)}</span>
</div>
<div class="config-bazaar__rating-distribution">${genRatingDistributionHTML(rating)}</div>` : "";
    return `<section class="item__meta-section config-bazaar__rating-detail">
<div class="item__meta-title">${window.siyuan.languages.bazaarRating}</div>
${aggregate}
${action}
</section>`;
};

export const applyPackageRating = (controller: TBazaarController, bazaarType: TBazaarType, packageName: string, rating?: IBazaarRating, refreshUI = true) => {
    const key = getRatingKey(bazaarType, packageName);
    if (rating) {
        controller._data.ratings.set(key, rating);
    } else {
        controller._data.ratings.delete(key);
    }
    const updateItem = (item?: IBazaarItem) => {
        applyBazaarPackageRatingToItem(item, packageName, rating);
    };
    controller._data[bazaarType].forEach(updateItem);
    if (controller._data.downloadedType === bazaarType) {
        controller._data.downloadedDefault.forEach(updateItem);
        controller._data.downloaded.forEach(updateItem);
    }
    controller._data.update[bazaarType].forEach((item) => {
        updateItem(item.installed);
        updateItem(item.available);
    });
    const detail = controller._getPackageDetail(bazaarType, packageName);
    updateItem(detail?.installed);
    updateItem(detail?.available);
    if (refreshUI) {
        refreshRatingUI(controller, bazaarType, packageName);
    }
};

export const applyPackageRatingResponse = (controller: TBazaarController, bazaarType: TBazaarType, packageName: string, data: {
        ratingAvailable?: unknown;
        rating?: Partial<IBazaarRating> | null;
    }, refreshUI = true) => {
    const key = getRatingKey(bazaarType, packageName);
    const publicRating = normalizeBazaarPackageRatingResponse(data);
    if (publicRating.loaded) {
        controller._data.downloadedRatingKeys.add(key);
        applyPackageRating(controller, bazaarType, packageName, publicRating.rating, refreshUI);
    } else {
        controller._data.downloadedRatingKeys.delete(key);
        if (refreshUI) {
            refreshRatingUI(controller, bazaarType, packageName);
        }
    }
    return publicRating.loaded;
};

export const getRatingItem = (controller: TBazaarController, bazaarType: TBazaarType, packageName: string, from: "downloaded" | "updated" | "bazaar") => {
    const detail = controller._getPackageDetail(bazaarType, packageName);
    if (from === "downloaded") {
        return detail?.installed || (controller._data.downloadedType === bazaarType ?
            controller._data.downloaded.find((item) => item.name === packageName) : undefined);
    }
    if (from === "updated") {
        return detail?.available || controller._getUpdatedItem(bazaarType, packageName)?.available;
    }
    return detail?.available || controller._data[bazaarType].find((item) => item.name === packageName);
};

export const refreshRatingUI = (controller: TBazaarController, bazaarType: TBazaarType, packageName: string) => {
    controller.element?.querySelectorAll(`.b3-card[data-package-type="${bazaarType}"]`).forEach((card) => {
        if (card.getAttribute("data-name") !== packageName) {
            return;
        }
        const source = card.getAttribute("data-package-source") as "downloaded" | "updated" | "bazaar";
        const item = getRatingItem(controller, bazaarType, packageName, source);
        const slot = card.querySelector<HTMLElement>("[data-rating-card-slot]");
        if (item && slot) {
            const key = getRatingKey(bazaarType, packageName);
            const loaded = isBazaarPackageRatingLoaded(source, controller._data.downloadedRatingKeys.has(key),
                item.ratingAvailable);
            if (source === "bazaar") {
                const rating = loaded ? getDisplayableBazaarRating(item.rating) : undefined;
                slot.classList.toggle("fn__none", !rating);
                if (rating) {
                    slot.setAttribute("aria-label", getRatingSummaryText(rating));
                    const averageElement = slot.lastElementChild;
                    if (averageElement) {
                        averageElement.textContent = rating.average.toLocaleString(undefined, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                        });
                    }
                }
            }
        }
    });
    const sideElement = controller.element?.querySelector("#configBazaarReadme.config__view--show .item__side");
    if (sideElement?.getAttribute("data-package-type") !== bazaarType ||
        sideElement.getAttribute("data-name") !== packageName) {
        return;
    }
    const from = sideElement.getAttribute("data-from") as "downloaded" | "updated" | "bazaar";
    const item = getRatingItem(controller, bazaarType, packageName, from);
    const slot = sideElement.querySelector('[data-type="rating-detail-slot"]');
    if (item && slot) {
        const key = getRatingKey(bazaarType, packageName);
        const loaded = isBazaarPackageRatingLoaded(from, controller._data.downloadedRatingKeys.has(key),
            item.ratingAvailable);
        const displayItem = from === "bazaar" ? item : {...item, rating: controller._data.ratings.get(key)};
        slot.innerHTML = genReadmeRatingHTML(controller, bazaarType, displayItem, loaded);
    }
};

export const loadDownloadedRatings = (controller: TBazaarController, bazaarType: TBazaarType, packages: IBazaarItem[]) => {
    const packageNames = packages.filter((item) => !item.invalidReason).map((item) => item.name);
    if (packageNames.length === 0) {
        return;
    }
    const requestID = (controller._data.ratingBatchRequestIDs.get(bazaarType) || 0) + 1;
    controller._data.ratingBatchRequestIDs.set(bazaarType, requestID);
    const mutationVersions = new Map(packageNames.map((packageName) => {
        const key = getRatingKey(bazaarType, packageName);
        return [packageName, getBazaarRatingMutationVersion(controller._data.ratingMutationVersions, key)];
    }));
    const mount = controller._captureMount();
    fetchPost("/api/bazaar/getBazaarPackageRatings", {
        packageType: bazaarType,
        packageNames,
    }, response => {
        if (response.code !== 0 || controller._data.ratingBatchRequestIDs.get(bazaarType) !== requestID ||
            !controller._isMountCurrent(mount) || !controller.element?.isConnected) {
            return;
        }
        const ratings = normalizeBazaarPackageRatingsResponse(packageNames, response.data);
        if (!ratings) {
            return;
        }
        ratings.forEach((ratingResponse, packageName) => {
            const key = getRatingKey(bazaarType, packageName);
            if (isBazaarRatingMutationVersionCurrent(controller._data.ratingMutationVersions, key,
                mutationVersions.get(packageName) || 0)) {
                applyPackageRatingResponse(controller, bazaarType, packageName, ratingResponse);
            }
        });
    });
};

export const loadUpdatedRatings = (controller: TBazaarController) => {
    BAZAAR_PACKAGE_TYPES.forEach((bazaarType) => {
        const items = controller._data.update[bazaarType];
        const installed = items.map((item) => item.installed);
        if (items.length && !items.every((item) => controller._data.downloadedRatingKeys.has(
            getRatingKey(bazaarType, item.installed.name)))) {
            loadDownloadedRatings(controller, bazaarType, installed);
        }
    });
};
