export const getCloudURL = (key: string) => {
    const origin = window.siyuan.config.cloudRegion === 0 ? "https://ld246.com" : "https://liuyun.io";
    if (!key || "" === key) {
        return origin;
    }
    return `${origin}/${key}`;
};
