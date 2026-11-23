import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireOrReuseDaemonLock, readDaemonLock } from '../src/core/daemon-lock.mjs';
import { createFocusArbiter } from '../src/core/focus-arbiter.mjs';

test('daemon-lock: acquires primary when absent, reuses when alive, takes over stale dead lock', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-lock-'));
  const lockFile = join(dir, 'daemon.lock.json');
  try {
    const first = await acquireOrReuseDaemonLock({
      lockFile,
      port: 19401,
      token: 'tok-a',
      mediaPort: 19402,
      version: '4.0.0',
      pid: 11111,
      probeFn: async () => ({ ok: false }),
    });
    assert.equal(first.role, 'primary');
    assert.equal(first.lock.port, 19401);
    assert.equal(readDaemonLock(lockFile).pid, 11111);

    // Second instance sees healthy probe -> reuse without overwriting
    const second = await acquireOrReuseDaemonLock({
      lockFile,
      port: 19409,
      token: 'tok-b',
      mediaPort: 19410,
      version: '4.0.0',
      pid: 22222,
      probeFn: async (rec) => ({ ok: rec.port === 19401 && rec.pid === 11111, pid: rec.pid, version: '4.0.0' }),
    });
    assert.equal(second.role, 'reuse');
    assert.equal(second.lock.port, 19401);
    assert.equal(second.lock.token, 'tok-a');
    second.release(); // non-owner release must not delete owner lock
    assert.equal(existsSync(lockFile), true);

    // Stale dead lock (probe fails) -> third takes over cleanly
    const third = await acquireOrReuseDaemonLock({
      lockFile,
      port: 19420,
      token: 'tok-c',
      mediaPort: 19421,
      version: '4.0.0',
      pid: 33333,
      probeFn: async () => ({ ok: false }),
    });
    assert.equal(third.role, 'primary');
    assert.equal(third.lock.pid, 33333);
    assert.equal(readDaemonLock(lockFile).port, 19420);

    // Corrupt lock file also cleanly recovers
    writeFileSync(lockFile, '{corrupt', 'utf8');
    const fourth = await acquireOrReuseDaemonLock({
      lockFile,
      port: 19430,
      token: 'tok-d',
      mediaPort: 19431,
      version: '4.0.0',
      pid: 44444,
      probeFn: async () => ({ ok: false }),
    });
    assert.equal(fourth.role, 'primary');
    fourth.release();
    assert.equal(existsSync(lockFile), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('focus-arbiter: freezes background video windows so at most one dynamic window plays at a time', () => {
  const arbiter = createFocusArbiter({ enabled: true, pauseOnBattery: true });
  arbiter.registerWindow('antigravity', { dynamic: true });
  arbiter.registerWindow('cherry', { dynamic: true });
  arbiter.registerWindow('codex', { dynamic: true });
  arbiter.registerWindow('zcode', { dynamic: false }); // static image never needs freeze

  arbiter.reportFocus('antigravity', { focused: true, visible: true });
  let d = arbiter.computePauseDirectives();
  assert.equal(arbiter.getActiveAppId(), 'antigravity');
  assert.equal(d.antigravity.paused, false);
  assert.equal(d.cherry.paused, true);
  assert.equal(d.cherry.reason, 'background-freeze');
  assert.equal(d.codex.paused, true);
  assert.equal(d.zcode.paused, false);

  // Switch focus to cherry
  arbiter.reportFocus('antigravity', { focused: false, visible: true });
  arbiter.reportFocus('cherry', { focused: true, visible: true });
  d = arbiter.computePauseDirectives();
  assert.equal(arbiter.getActiveAppId(), 'cherry');
  assert.equal(d.cherry.paused, false);
  assert.equal(d.antigravity.paused, true);
  assert.equal(d.codex.paused, true);

  // All hidden/minimized -> all dynamic paused
  arbiter.reportFocus('cherry', { focused: false, visible: false });
  arbiter.reportFocus('antigravity', { focused: false, visible: false });
  arbiter.reportFocus('codex', { focused: false, visible: false });
  d = arbiter.computePauseDirectives();
  assert.equal(d.cherry.paused, true);
  assert.equal(d.antigravity.paused, true);

  // Battery mode pauses even the focused dynamic window
  arbiter.reportFocus('antigravity', { focused: true, visible: true });
  arbiter.setBatteryMode(true);
  d = arbiter.computePauseDirectives();
  assert.equal(d.antigravity.paused, true);
  assert.equal(d.antigravity.reason, 'battery-saver');

  // Turning off battery resumes focused only
  arbiter.setBatteryMode(false);
  d = arbiter.computePauseDirectives();
  assert.equal(d.antigravity.paused, false);
  assert.equal(d.cherry.paused, true);

  // Disabling focusFreeze allows all visible windows to run
  arbiter.setOptions({ enabled: false, pauseOnBattery: false });
  arbiter.reportFocus('cherry', { focused: false, visible: true });
  d = arbiter.computePauseDirectives();
  assert.equal(d.antigravity.paused, false);
  assert.equal(d.cherry.paused, false);
});
