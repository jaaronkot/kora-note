import {isMobile} from "../util/functions";
import {sanitizeKernelHTML} from "../util/hostCapabilities";

// 退出提示沿用 exitProgress 作为根元素标识，内核消息合并与输入屏蔽都按该标识判断。
const EXIT_INDICATOR_ID = "exitProgress";

const isVisible = (element: HTMLElement | null): element is HTMLElement => {
    if (!element) {
        return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
};

// 退出提示停靠在角落的主菜单按钮上方：桌面端是左侧停靠栏底端的齿轮，移动端是底栏右侧的更多按钮。
const getAnchorElement = (): HTMLElement | null => {
    if (isMobile()) {
        return document.getElementById("toolbarMore");
    }
    // 云同步按钮已移到左侧停靠栏底端、齿轮上方，浮层改为停靠在同步按钮上方，左边缘与按钮对齐，表示从属于该按钮。
    const syncButton = document.getElementById("barSync");
    if (isVisible(syncButton)) {
        return syncButton;
    }
    const workspaceButton = document.getElementById("dockWorkspaceMenu");
    return isVisible(workspaceButton) ? workspaceButton : null;
};

const positionIndicator = (element: HTMLElement): void => {
    const anchor = getAnchorElement();
    const rect = anchor?.getBoundingClientRect();
    if (!anchor || !rect || rect.width === 0 && rect.height === 0) {
        // 锚点不可见时贴到视口左下角，避免浮层落到视口之外。
        element.style.left = "8px";
        element.style.right = "auto";
        element.style.bottom = "8px";
        return;
    }
    element.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
    if (isMobile()) {
        element.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`;
        element.style.left = "auto";
    } else {
        element.style.left = `${Math.round(rect.left)}px`;
        element.style.right = "auto";
    }
};

const createIndicator = (): HTMLElement => {
    const element = document.createElement("div");
    element.id = EXIT_INDICATOR_ID;
    element.className = "exit-indicator";
    element.setAttribute("role", "status");
    element.innerHTML = `<div class="exit-indicator__body">
    <svg class="exit-indicator__icon fn__rotate"><use xlink:href="#iconRefresh"></use></svg>
    <div class="exit-indicator__text">
        <div data-type="message" class="ft__breakword"></div>
    </div>
</div>
<div class="exit-indicator__actions"></div>`;
    element.style.zIndex = String(++window.siyuan.zIndex);
    document.body.appendChild(element);
    positionIndicator(element);
    return element;
};

export const showExitIndicator = (message: string): void => {
    let element = document.getElementById(EXIT_INDICATOR_ID);
    if (!element) {
        element = createIndicator();
    }
    const messageElement = element.querySelector('[data-type="message"]');
    if (messageElement) {
        messageElement.textContent = message;
    }
    positionIndicator(element);
};

export const updateExitIndicator = (message: string): void => {
    const element = document.getElementById(EXIT_INDICATOR_ID);
    if (!element) {
        return;
    }
    let status = element.querySelector('[data-type="status-message"]');
    if (!status) {
        status = document.createElement("div");
        status.className = "ft__breakword ft__smaller";
        status.setAttribute("data-type", "status-message");
        status.setAttribute("role", "status");
        const messageElement = element.querySelector('[data-type="message"]');
        if (messageElement) {
            messageElement.after(status);
        }
    }
    status.innerHTML = sanitizeKernelHTML(message);
};

// 同步耗时超过阈值后给出跳过同步的出口，同一浮层内只提供一个按钮。
export const setExitIndicatorAction = (label: string, callback: () => void): void => {
    const element = document.getElementById(EXIT_INDICATOR_ID);
    if (!element) {
        return;
    }
    const actions = element.querySelector(".exit-indicator__actions");
    if (!actions || actions.querySelector("button")) {
        return;
    }
    const button = document.createElement("button");
    button.className = "b3-button b3-button--text";
    button.textContent = label;
    button.addEventListener("click", callback);
    actions.appendChild(button);
    button.focus({preventScroll: true});
};

export const hideExitIndicator = (): void => {
    document.getElementById(EXIT_INDICATOR_ID)?.remove();
};
