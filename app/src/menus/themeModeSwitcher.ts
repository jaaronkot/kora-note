import {appearanceThemeModeValue, saveThemeMode} from "../config/tabs/appearanceRuntime";

interface IThemeModeItem {
    mode: number;
    icon: string;
    label: () => string;
}

// 跟随系统、浅色、深色的排列顺序与主菜单中的展示顺序一致。
const themeModeItems: IThemeModeItem[] = [
    {mode: 2, icon: "iconMode", label: () => window.siyuan.languages.themeOS},
    {mode: 0, icon: "iconLight", label: () => window.siyuan.languages.themeLight},
    {mode: 1, icon: "iconDark", label: () => window.siyuan.languages.themeDark},
];

/**
 * 主菜单顶部的外观模式分段控件：三个图标按钮并排，当前模式以高亮块标出。
 */
export const createThemeModeSwitcher = (): HTMLElement => {
    const element = document.createElement("div");
    element.className = "b3-menu__theme-mode";
    const currentMode = appearanceThemeModeValue();
    themeModeItems.forEach((item) => {
        const button = document.createElement("button");
        button.className = "b3-menu__theme-mode__item";
        if (item.mode === currentMode) {
            button.classList.add("b3-menu__theme-mode__item--active");
        }
        button.setAttribute("aria-label", item.label());
        button.innerHTML = `<svg><use xlink:href="#${item.icon}"></use></svg>`;
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            saveThemeMode(item.mode);
            // 配置写回是异步的，先就地更新高亮，避免等待期间高亮与实际模式不一致。
            element.querySelectorAll(".b3-menu__theme-mode__item").forEach((itemElement) => {
                itemElement.classList.remove("b3-menu__theme-mode__item--active");
            });
            button.classList.add("b3-menu__theme-mode__item--active");
        });
        element.append(button);
    });
    return element;
};
