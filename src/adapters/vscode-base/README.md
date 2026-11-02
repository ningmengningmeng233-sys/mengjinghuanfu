# vscode-base: VS Code 系共享骨架（A-6）

本目录**不是适配器**（没有 adapter.json，加载器会跳过没有 adapter.json 的
目录）。它存放 VS Code 系 IDE 家族（Cursor、Trae、Windsurf、Kiro）共用的一
份「骨架部件表」`parts-map.json`，是 S-6 Spike 的结论落地：VS Code OSS 分叉
共用同一套 workbench DOM 骨架（`.monaco-workbench`、`.part.*`、`.monaco-editor`、
`.xterm` 等），一份骨架可覆盖各家的大部分界面；AI 聊天层是各家自研 UI，不在
骨架内，必须逐家抓 DOM 后写进各自适配器的 parts-map。

## 引用方式（现行机制下如何"继承"）

仓库现行结构没有适配器继承机制（adapter.json 是纯数据、加载器不做合并），
所以共享靠**约定 + 测试守卫**，不发明新机制：

1. 新 VS Code 系适配器建档时，先把本文件的部件条目**整份复制**进自己的
   `adapters/<id>/parts-map.json` 作为起点。
2. 然后按该应用自己的实测快照**删改**：快照里没有的骨架条目要删掉（没有实证
   的锚点不进正式 map，这是项目铁规），自研聊天层锚点按实测追加。
3. `tests/a-6-vscode-family.test.mjs` 与 `tests/a-7-windsurf-kiro.test.mjs`
   守着不漂移：凡某适配器 map 里保留的骨架部件，其选择器必须与本文件逐字一
   致；要改骨架选择器先改本文件，再同步各家。

## 实测状态（2026-11-02）

- `app.root` 的 `.monaco-workbench` 已在 Cursor 3.27.22 真机快照中实测命中
  （未登录状态下工作台只渲染了根节点，其余 `.part.*` 未出现）。
- 其余骨架条目来自 VS Code 开源骨架的公共结构（S-6 记录），在本机各应用上
  的命中要等各家登录 / 完成初次设置后抓工作台快照逐个确认；确认一家、回填
  一家的 map。
- Windsurf、Kiro 未安装，两家的 map 是本骨架的整份复制并标注「未实测」，装
  机后必须先抓快照订正再视为可用。
