import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  cleanHostEnv,
  resolveNodeExe,
  defaultPortForApp,
} from '../src/prism/cdp/gentle-cdp.mjs';
import { createMultiAppCanary } from '../src/prism/cdp/canary.mjs';
import {
  parseWindowsLnkBuffer,
  patchDebugArg,
  stripDebugArg,
  inspectAppShortcuts,
  enableAppShortcutAutoLoad,
  disableAppShortcutAutoLoad,
} from '../src/prism/cdp/shortcuts.mjs';

function buildSyntheticUnicodeLnk({ targetPath, args = '', workDir = '' }) {
  // Minimal valid [MS-SHLLINK] binary with IsUnicode(0x80) | HasRelativePath(0x08) | HasWorkDir(0x10) | HasArgs(0x20)
  const header = Buffer.alloc(76, 0);
  header.writeUInt32LE(0x0000004c, 0);
  header.writeUInt32LE(0x80 | 0x08 | 0x10 | 0x20, 20);
  const strChunk = (s) => {
    const body = Buffer.from(s, 'utf16le');
    const len = Buffer.alloc(2);
    len.writeUInt16LE(s.length, 0);
    return Buffer.concat([len, body]);
  };
  return Buffer.concat([header, strChunk(targetPath), strChunk(workDir), strChunk(args)]);
}

test('gentle-cdp: cleanHostEnv strips Electron-as-Node variables and assigns deterministic non-colliding ports', () => {
  const cleaned = cleanHostEnv({ EXTRA_FLAG: '1' }, { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--inspect', KEEP: 'ok' });
  assert.equal(cleaned.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(cleaned.NODE_OPTIONS, undefined);
  assert.equal(cleaned.KEEP, 'ok');
  assert.equal(cleaned.EXTRA_FLAG, '1');
  assert.ok(resolveNodeExe().exe);

  assert.equal(defaultPortForApp('antigravity'), 9339);
  assert.notEqual(defaultPortForApp('cherry'), 9339);
  assert.notEqual(defaultPortForApp('cherry'), defaultPortForApp('zcode'));
});

test('shortcuts: patchDebugArg / stripDebugArg idempotent and parseWindowsLnkBuffer handles Chinese Unicode paths', () => {
  assert.equal(patchDebugArg('', 9339), '--remote-debugging-port=9339');
  assert.equal(patchDebugArg('--foo --remote-debugging-port=9222', 9339), '--foo --remote-debugging-port=9339');
  assert.equal(patchDebugArg('--foo --remote-debugging-port=9339', 9339), '--foo --remote-debugging-port=9339');
  assert.equal(stripDebugArg('--foo --remote-debugging-port=9339 --bar'), '--foo --bar');

  const buf = buildSyntheticUnicodeLnk({
    targetPath: 'C:\\应用\\反重力\\Antigravity.exe',
    workDir: 'C:\\应用\\反重力',
    args: '--user-flag=1',
  });
  const parsed = parseWindowsLnkBuffer(buf);
  assert.equal(parsed.targetPath, 'C:\\应用\\反重力\\Antigravity.exe');
  assert.equal(parsed.arguments, '--user-flag=1');
  assert.equal(parsed.workingDirectory, 'C:\\应用\\反重力');
});

test('shortcuts: generalized enable & lossless restore with backup work for any exe adapter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-lnk-'));
  const desktop = join(dir, 'Desktop');
  const dataDir = join(dir, 'v4');
  const lnkFile = join(desktop, 'Cherry Studio.lnk');
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(desktop, { recursive: true });
    writeFileSync(
      lnkFile,
      buildSyntheticUnicodeLnk({ targetPath: 'C:\\Apps\\Cherry Studio.exe', args: '--lang=zh' }),
    );

    const fakeApp = { id: 'cherry', name: 'Cherry Studio', exeName: 'Cherry Studio.exe' };
    const writer = async (updates) => {
      for (const u of updates) {
        writeFileSync(
          u.path,
          buildSyntheticUnicodeLnk({ targetPath: 'C:\\Apps\\Cherry Studio.exe', args: u.arguments }),
        );
      }
      return updates.map((u) => ({ path: u.path, ok: true, error: '' }));
    };

    const before = await inspectAppShortcuts({ app: fakeApp, port: 9341, dataDir, searchDirs: [desktop] });
    assert.equal(before.normalShortcutEnabled, false);
    assert.equal(before.shortcuts.length, 1);

    const en = await enableAppShortcutAutoLoad({ app: fakeApp, port: 9341, dataDir, searchDirs: [desktop], writeLnkFn: writer });
    assert.equal(en.ok, true);
    assert.equal(en.normalShortcutEnabled, true);
    assert.equal(en.shortcuts[0].arguments, '--lang=zh --remote-debugging-port=9341');
    assert.equal(existsSync(join(dataDir, 'shortcut-backup.json')), true);

    const dis = await disableAppShortcutAutoLoad({ app: fakeApp, port: 9341, dataDir, searchDirs: [desktop], writeLnkFn: writer });
    assert.equal(dis.ok, true);
    assert.equal(dis.normalShortcutEnabled, false);
    assert.equal(dis.shortcuts[0].arguments, '--lang=zh');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('canary: per-app two-phase fsync canary trips after 2 unfinished boots without affecting sibling apps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-canary-'));
  try {
    const canary = createMultiAppCanary({ dataDir: dir });
    assert.equal(canary.status('antigravity').state, 'idle');

    // Attempt 1 armed, never marked healthy
    assert.equal(canary.evaluateBoot('antigravity', 'sess-1').allowInject, true);
    canary.arm('antigravity', 'sess-1');
    assert.equal(canary.status('antigravity').state, 'arming');

    // Attempt 2 starts while previous unfinished -> records 1 unfinished, still allows
    assert.equal(canary.evaluateBoot('antigravity', 'sess-2').allowInject, true);
    canary.arm('antigravity', 'sess-2');

    // Attempt 3 while 2 unfinished in window -> trips safe mode!
    const eval3 = canary.evaluateBoot('antigravity', 'sess-3');
    assert.equal(eval3.allowInject, false);
    assert.equal(eval3.tripped, true);
    assert.equal(canary.status('antigravity').state, 'tripped');

    // Sibling app cherry is unaffected
    assert.equal(canary.evaluateBoot('cherry', 'c-1').allowInject, true);

    // Reset clears tripped state
    canary.reset('antigravity');
    assert.equal(canary.status('antigravity').state, 'idle');
    assert.equal(canary.evaluateBoot('antigravity', 'sess-4').allowInject, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
