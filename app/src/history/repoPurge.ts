import type {RepoSource} from "./repoBatch";

export const canPurgeRepo = (source: RepoSource, provider: number) => {
    // 旧配置可能仍保留已下线的提供商，只有受支持的存储才开放云端清理。
    return source === "local" || provider === 3 || provider === 4;
};
