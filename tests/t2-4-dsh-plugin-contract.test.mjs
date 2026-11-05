// T2-4 contract addendum (2026-11-05): the plugin package must satisfy the
// DSH bundle contract - package.json declares dsh.bundle.patch pointing at
// a shipped cordis.patch.yml whose insert row mounts the package entry, and
// apply(ctx) contributes the current skin as style rows on the host
// webserver index-inject event. Everything runs against temp directories;
// no DSH process is started (real-machine proof lives in the batch evidence).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPluginFiles, PLUGIN_NAME, PLUGIN_FILES } from "../src/channels/dsh-plugin.mjs";
import { serializeSkinFile } from "../src/theme/layers.mjs";
import { apply, skinStyleRows } from "../src/channels/dsh-plugin/lib/main.js";

test("bundle contract: manifest declares dsh.bundle.patch at a shipped file", () => {
  const files = buildPluginFiles();
  const pkg = JSON.parse(files["package.json"]);
  assert.equal(typeof pkg.dsh?.bundle?.patch, "string");
  assert.ok(pkg.dsh.bundle.patch.length > 0);
  const patchRel = pkg.dsh.bundle.patch.replace(/^\.\//, "");
  assert.ok(PLUGIN_FILES.includes(patchRel), patchRel + " must be in the install file set");
  assert.ok(typeof files[patchRel] === "string" && files[patchRel].length > 0);
  assert.equal(pkg.exports["./cordis.patch.yml"], "./cordis.patch.yml");
  assert.equal(pkg.exports["./package.json"], "./package.json");
  assert.equal(pkg.exports["."], "./lib/main.js");
});

test("bundle contract: patch inserts one row mounting the package by name", () => {
  const patch = buildPluginFiles()["cordis.patch.yml"];
  assert.match(patch, /-\s+insert:/);
  assert.ok(patch.includes("id: " + PLUGIN_NAME));
  assert.ok(patch.includes("name: \"" + PLUGIN_NAME + "\""));
});

function tempSkinHome(layers) {
  const root = mkdtempSync(join(tmpdir(), "ds-contract-"));
  const dir = join(root, "DreamSkin", "dsh");
  mkdirSync(dir, { recursive: true });
  if (layers) writeFileSync(join(dir, "active-skin.css"), serializeSkinFile(layers), "utf8");
  return { root, env: { LOCALAPPDATA: root }, skin: join(dir, "active-skin.css") };
}

test("index-inject: apply subscribes and pushes one style row per non-empty layer", () => {
  const { root, env } = tempSkinHome({ vars: "V{}", parts: "P{}", extra: "" });
  try {
    let handler = null;
    let eventName = null;
    const ctx = { on: (name, fn) => { eventName = name; handler = fn; return () => {}; } };
    const dispose = apply(ctx, { env });
    assert.equal(eventName, "webserver/index-inject");
    const table = [];
    handler(table);
    assert.deepEqual(table, [{ kind: "style", text: "P{}" }, { kind: "style", text: "V{}" }]);
    assert.deepEqual(skinStyleRows(env), table);
    if (typeof dispose === "function") dispose();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("index-inject: no skin file means no rows; file removal empties later tables", () => {
  const { root, env, skin } = tempSkinHome(null);
  try {
    assert.deepEqual(skinStyleRows(env), []);
    writeFileSync(skin, serializeSkinFile({ vars: "", parts: "X{}", extra: "" }), "utf8");
    assert.deepEqual(skinStyleRows(env), [{ kind: "style", text: "X{}" }]);
    rmSync(skin);
    assert.deepEqual(skinStyleRows(env), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
