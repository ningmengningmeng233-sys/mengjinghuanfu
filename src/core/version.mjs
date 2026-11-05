// 梦境换肤版本号的单一来源（T0-3）。其他地方一律从这里取，不许再写死版本号：
// - 主题库请求的 User-Agent（store/gallery.mjs）
// - 规则段版本与 status 输出（adapters/*/extra.css 的 {{version}} 占位由 core/app-runtime.mjs 组装时替换、dreamskin.mjs）
// - 总控台标题与 .exe 文件版本：总控台是 .NET 程序，构建时由 tools/check-version.mjs 校验其 AssemblyVersion 与这里一致（不一致就构建失败）。
// 发布 3.0 时只改这一处（Q-4 改成 3.0.0）。
export const VERSION = '3.0.0';
export const USER_AGENT = `DreamSkin/${VERSION} (theme gallery)`;
