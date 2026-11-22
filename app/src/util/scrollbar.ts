const SCROLL_HIDE_DELAY = 700;

/**
 * 滚动条滑块默认隐藏，滚动时显示：给正在滚动的容器加上状态类，停止滚动后移除。
 */
export const initScrollbarVisibility = () => {
    let timer = 0;
    window.addEventListener("scroll", (event: Event) => {
        // scroll 事件不冒泡，捕获阶段才能拿到真正发生滚动的容器
        const target = event.target === document ? document.scrollingElement : event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        target.classList.add("fn__scroll-active");
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            document.querySelectorAll(".fn__scroll-active").forEach((item) => {
                item.classList.remove("fn__scroll-active");
            });
        }, SCROLL_HIDE_DELAY);
    }, {passive: true, capture: true});
};
