// 梦境换肤版本号的单一来源（T0-3）。其他地方一律从这里取，不许再写死版本号：
// - 主题库请求的 User-Agent（lib/gallery.mjs）
// - 规则段注释与 status 输出（lib/cherry-skin-css.mjs、lib/zcode-skin-css.mjs、skin-cherry.mjs）
// - 总控台标题与 .exe 文件版本：总控台是 .NET 程序，构建时由 tools/check-version.mjs 校验其 AssemblyVersion 与这里一致（不一致就构建失败）。
// 发布 3.0 时只改这一处（Q-4 改成 3.0.0）。
export const VERSION = '2.1.0';
export const USER_AGENT = `DreamSkin/${VERSION} (theme gallery)`;
