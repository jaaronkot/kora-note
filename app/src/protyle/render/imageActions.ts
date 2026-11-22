import {isEntryVisible} from "../../config/entryVisibility/runtime";
import {copyPNGByLink} from "../../menus/util";

const boundImageActions = new WeakSet<HTMLElement>();

const updateActionCorners = (actions: Element) => {
    const icons = Array.from(actions.querySelectorAll(".protyle-icon"));
    icons.forEach(icon => icon.classList.remove("protyle-icon--first", "protyle-icon--last", "protyle-icon--only"));
    if (icons.length === 1) {
        icons[0].classList.add("protyle-icon--only");
    } else if (icons.length > 1) {
        icons[0].classList.add("protyle-icon--first");
        icons[icons.length - 1].classList.add("protyle-icon--last");
    }
};

export const renderImageActions = (root: Element) => {
    root.querySelectorAll<HTMLImageElement>(".img img").forEach(image => {
        renderCopyImageAction(image);
    });
};

const renderCopyImageAction = (image: HTMLImageElement) => {
    const actions = image.parentElement?.querySelector(".protyle-icons");
    const existing = actions?.querySelector<HTMLElement>(".protyle-action__copy-image");
    if (!actions) {
        return;
    }
    if (window.siyuan.isPublish || !image.closest(".protyle-wysiwyg") || !isEntryVisible("editor.image.copyAsPNG")) {
        existing?.remove();
        updateActionCorners(actions);
        return;
    }
    if (existing && boundImageActions.has(existing)) {
        return;
    }
    existing?.remove();
    const action = document.createElement("span");
    boundImageActions.add(action);
    action.className = "protyle-icon protyle-icon--first protyle-action__copy-image ariaLabel";
    action.tabIndex = 0;
    action.setAttribute("role", "button");
    action.setAttribute("aria-label", window.siyuan.languages.copyAsPNG);
    action.setAttribute("data-position", "north");
    action.innerHTML = '<svg><use xlink:href="#iconImage"></use></svg>';
    const copy = () => copyPNGByLink(image.getAttribute("src") || image.getAttribute("data-src"));
    action.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        copy();
    });
    action.addEventListener("keydown", (event: KeyboardEvent) => {
        if ((event.key === "Enter" || event.key === " ") && !event.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            copy();
        }
    });
    actions.querySelector(".protyle-icon--only")?.classList.replace("protyle-icon--only", "protyle-icon--last");
    const more = actions.querySelector(".protyle-icon--last");
    actions.insertBefore(action, more);
    updateActionCorners(actions);
};

window.addEventListener("siyuan-entry-visibility", () => renderImageActions(document.documentElement));
