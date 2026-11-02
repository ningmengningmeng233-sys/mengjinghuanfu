// A-6: VS Code family shared skeleton (vscode-base) + drift guard.
//
// Family design (S-6): the IDE skeleton is shared, the AI chat layer is
// per-app. The repo has no adapter inheritance mechanism, so the shared
// skeleton lives as data in src/adapters/vscode-base/parts-map.json (a
// directory without adapter.json, skipped by the loader) and each
// adapter copies + trims it against its own measured snapshot; these
// tests guard the no-drift rule (any skeleton part an adapter keeps
// must match the base selector-for-selector).
//
// History: the Cursor / Trae adapters were measured on 2026-11-02 and
// removed the same day by owner decision (apps uninstalled, see the
// A-6 evidence addendum); their loader/profile/channel/snapshot tests
// went with them. The remaining copy-holders of the skeleton are the
// UNVERIFIED windsurf / kiro adapters (A-7, not installed), whose maps
// are verbatim copies of the base.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAdapters } from "../src/core/adapters.mjs";
import { appRuntimeById } from "../src/core/app-runtime.mjs";
import { loadParts } from "../src/parts/parts.mjs";

const baseMap = JSON.parse(readFileSync(new URL("../src/adapters/vscode-base/parts-map.json", import.meta.url), "utf8"));

test("base: skeleton only uses catalogue part ids and app.root is fully formed", () => {
  const ids = new Set(loadParts().parts.map((p) => p.id));
  for (const id of Object.keys(baseMap)) assert.ok(ids.has(id), "base part in catalogue: " + id);
  assert.deepEqual(Object.keys(baseMap["app.root"]).sort(), ["required", "scope", "scopeBody", "selector"]);
  assert.equal(baseMap["app.root"].selector, ".monaco-workbench");
});

test("registry: exactly the eight kept adapters load; vscode-base stays a non-adapter", () => {
  const { adapters, errors } = loadAdapters();
  assert.deepEqual(errors, []);
  assert.deepEqual(adapters.map((a) => a.id).sort(), [
    "cherry", "codex", "dsh", "kiro", "minimax-code", "minimax-design", "windsurf", "zcode",
  ]);
});

test("no drift: every skeleton part kept by windsurf/kiro matches the base verbatim", () => {
  for (const id of ["windsurf", "kiro"]) {
    const map = appRuntimeById(id).partsMap;
    for (const [part, entry] of Object.entries(map)) {
      if (baseMap[part]) assert.deepEqual(entry, baseMap[part], id + " " + part + " must equal the base entry");
    }
  }
});
