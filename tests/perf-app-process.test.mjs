// 3.0.3 性能批：进程全量快照与注册表全量缓存的纯逻辑单测。
// 只测内存过滤/映射口径（processesForApp / uninstallEntriesForApp），不真调 PowerShell。
import { test } from "node:test";
import assert from "node:assert/strict";
import { processesForApp, uninstallEntriesForApp } from "../src/core/app-process.mjs";

const rows = [
  { name: "ZCode.exe", pid: 101, path: "F:\\AI\\ZCode\\ZCode.exe", cmd: "\"F:\\AI\\ZCode\\ZCode.exe\"" },
  { name: "ZCode.exe", pid: 102, path: "F:\\AI\\ZCode\\ZCode.exe", cmd: "ZCode.exe --type=renderer" },
  { name: "zcode.exe", pid: 103, path: "", cmd: "ZCode.exe --type=gpu-process" },
  { name: "Cherry Studio.exe", pid: 201, path: "C:\\Cherry\\Cherry Studio.exe", cmd: "\"Cherry Studio.exe\"" },
  { name: "node.exe", pid: 301, path: "C:\\node.exe", cmd: "node server.js" },
];

test("processesForApp 按 exe 名过滤（不区分大小写）并保持 pid/path/cmd", () => {
  const app = { exeName: "ZCode.exe" };
  const got = processesForApp(rows, app);
  assert.equal(got.length, 3);
  assert.deepEqual(got.map((p) => p.pid), [101, 102, 103]);
  assert.equal(got[0].path, "F:\\AI\\ZCode\\ZCode.exe");
  assert.equal(got[2].path, "");
});

test("processesForApp isMain 口径：--type= 子进程不是主进程", () => {
  const got = processesForApp(rows, { exeName: "ZCode.exe" });
  assert.deepEqual(got.map((p) => p.isMain), [true, false, false]);
});

test("processesForApp isMain 口径：isHelperCmd 命中的不算主进程", () => {
  const app = { exeName: "node.exe", isHelperCmd: (cmd) => cmd.includes("server") };
  const got = processesForApp(rows, app);
  assert.equal(got.length, 1);
  assert.equal(got[0].isMain, false);
});

test("processesForApp 空名单与无命中都返回空数组", () => {
  assert.deepEqual(processesForApp([], { exeName: "ZCode.exe" }), []);
  assert.deepEqual(processesForApp(rows, { exeName: "Nope.exe" }), []);
  assert.deepEqual(processesForApp(null, { exeName: "ZCode.exe" }), []);
});

const entries = [
  { displayName: "ZCode", installLocation: "", displayIcon: "F:\\AI\\ZCode\\ZCode.exe", uninstallString: "" },
  { displayName: "ZCode Beta", installLocation: "", displayIcon: "", uninstallString: "" },
  { displayName: "Cherry Studio", installLocation: "C:\\Cherry", displayIcon: "", uninstallString: "" },
  { displayName: "zcode helper", installLocation: "", displayIcon: "", uninstallString: "" },
];

test("uninstallEntriesForApp 前缀匹配（不区分大小写，等价 -like Name*）", () => {
  const got = uninstallEntriesForApp(entries, "ZCode");
  assert.deepEqual(got.map((e) => e.displayName), ["ZCode", "ZCode Beta", "zcode helper"]);
});

test("uninstallEntriesForApp 空前缀返回全部、无命中返回空", () => {
  assert.equal(uninstallEntriesForApp(entries, "").length, 4);
  assert.deepEqual(uninstallEntriesForApp(entries, "Nope"), []);
  assert.deepEqual(uninstallEntriesForApp(null, "ZCode"), []);
});
