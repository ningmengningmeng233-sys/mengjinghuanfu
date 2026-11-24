import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { startStudioDaemon } from '../src/studio-daemon.mjs';
import { buildClientSkinPayload, getHostPanelScript, getHostSkinScript } from '../src/prism/host/index.mjs';
import { evaluateTargetEphemeral, listCdpTargets, probeCdpPort } from '../src/prism/cdp/gentle-cdp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const distHtmlPath = join(root, 'src', 'studio-ui', 'dist', 'index.html');

function findBrowserExe() {
  const candidates = [
    process.env.CHROME_EXE,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || '';
}

async function launchHeadlessBrowser(url) {
  const exe = findBrowserExe();
  assert.ok(exe, 'Chrome or Edge binary required for headless browser E2E test');
  const userDataDir = mkdtempSync(join(tmpdir(), 'ds-chrome-'));
  // Pick a random free port by binding temporary server
  const port = await new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });

  const child = spawn(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1280,820',
      url,
    ],
    { stdio: 'ignore', windowsHide: true },
  );

  const deadline = Date.now() + 15000;
  let pageTarget = null;
  while (Date.now() < deadline) {
    const probe = await probeCdpPort(port, '127.0.0.1', 500);
    if (probe.ok) {
      const targets = await listCdpTargets(port, '127.0.0.1');
      pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && !String(t.url).startsWith('devtools://'));
      if (pageTarget) break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(pageTarget, 'Headless browser did not expose page CDP target in time');

  return {
    port,
    wsUrl: pageTarget.webSocketDebuggerUrl,
    async close() {
      try { child.kill(); } catch {}
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    },
  };
}

test('studio-ui bundle: offline single-file HTML exists with zero external scripts and full-height #app', () => {
  assert.equal(existsSync(distHtmlPath), true, 'dist/index.html must be built by tools/build-studio-ui.mjs');
  const html = readFileSync(distHtmlPath, 'utf8');
  assert.ok(html.includes('id="app"'));
  assert.ok(html.includes('height: 100dvh') || html.includes('height: 100%'));
  assert.equal(/https?:\/\/cdn\./i.test(html), false, 'Must have zero external CDN dependencies');
  assert.equal(/type=["']module["']/.test(html), false, 'Must bundle as inline IIFE (zero ES module sidecar timeout)');
});

test('e2e headless browser: Studio UI two-tier simplicity + Antigravity Hub hole cutout + Ctrl+Alt+W + 4x Esc panic strip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-e2e-'));
  const daemon = await startStudioDaemon({
    dataDir: dir,
    port: 0,
    autoPoll: false,
    skipStartupScan: true,
    disableDeferredScan: true,
    steamRoot: join(dir, 'no-steam'),
    includeDefaultPictures: false,
    skipInitialAppsScan: true,
  });

  // Mock Antigravity Hub page with [data-browser-hole]
  const mockHub = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="zh-CN"><body class="dark" style="margin:0;height:100vh;background:#070708;color:#fff">
      <div id="root" class="agy-shell" style="display:flex;width:100%;height:100vh">
        <aside class="agy-sidebar" style="width:240px;height:100%;background:#111114">Sidebar</aside>
        <main data-testid="conversation-view" style="flex:1;height:100%;position:relative">
          <div data-testid="agent-input-box" style="height:60px;background:#131317">Composer</div>
          <div data-browser-hole="true" style="position:fixed;left:420px;top:120px;width:500px;height:400px;border-radius:12px;"></div>
        </main>
      </div>
    </body></html>`);
  });
  await new Promise((r) => mockHub.listen(0, '127.0.0.1', r));
  const hubUrl = `http://127.0.0.1:${mockHub.address().port}/`;

  let browser1 = null;
  let browser2 = null;
  try {
    // Part A: Verify Studio UI renders cleanly with <= 2 default visible sliders and collapsed advanced drawer
    browser1 = await launchHeadlessBrowser(daemon.url);
    await new Promise((r) => setTimeout(r, 900));
    const uiCheck = await evaluateTargetEphemeral(
      browser1.wsUrl,
      `(() => {
        const app = document.getElementById('app');
        const rect = app ? app.getBoundingClientRect() : { height: 0 };
        const drawer = document.querySelector('details.prism-adv-drawer');
        const visibleRanges = [...document.querySelectorAll('input[type="range"]')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null;
        });
        const sceneCards = document.querySelectorAll('[data-scene-preset]').length;
        const appItems = document.querySelectorAll('[data-app-id]').length;
        return {
          ready: app && app.getAttribute('data-prism-ready') === 'true',
          appHeight: rect.height,
          drawerCollapsed: Boolean(drawer && !drawer.open),
          visibleSliderCount: visibleRanges.length,
          sceneCards,
          appItems,
        };
      })()`,
      { timeoutMs: 5000 },
    );
    assert.equal(uiCheck.ready, true, 'Studio UI must reach ready state');
    assert.ok(uiCheck.appHeight >= 500, `Studio #app must not collapse, got height ${uiCheck.appHeight}`);
    assert.equal(uiCheck.drawerCollapsed, true, 'Advanced tweaks drawer must be collapsed by default');
    assert.ok(uiCheck.visibleSliderCount <= 3, `Default view must show <= 3 sliders, got ${uiCheck.visibleSliderCount}`);
    assert.equal(uiCheck.sceneCards, 4, 'Default view must display 4 simple scene preset cards');
    assert.equal(uiCheck.appItems, 8, 'App switcher must list all 8 adapters including Antigravity');
    await browser1.close();
    browser1 = null;

    // Part B: Verify microkernel + [data-browser-hole] cutout + Ctrl+Alt+W popover + 4x Esc panic strip on Mock Hub
    browser2 = await launchHeadlessBrowser(hubUrl);
    await new Promise((r) => setTimeout(r, 400));
    await evaluateTargetEphemeral(browser2.wsUrl, getHostSkinScript(), { timeoutMs: 5000 });
    await evaluateTargetEphemeral(browser2.wsUrl, getHostPanelScript(), { timeoutMs: 5000 });

    const payload = buildClientSkinPayload(
      { layoutMode: 'islands', colorScheme: 'prism-default', glassOpacity: 0.76 },
      { id: 'test-img', kind: 'image', mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
      daemon.mediaOrigin,
      { skinEnabled: true, adapterProfile: { appId: 'antigravity', mode: 'full', adapterCss: '', browserHoleSupport: true } },
    );
    const applied = await evaluateTargetEphemeral(
      browser2.wsUrl,
      `(() => {
        window.__agyPrism.applyPayload(${JSON.stringify(payload)});
        window.__agyPrism.syncBrowserHoles();
        window.__agyPrismPanel.open();
        const st = window.__agyPrism.status();
        const pop = document.getElementById('agy-prism-popover');
        return {
          skinAttr: document.documentElement.getAttribute('data-agy-prism-skin'),
          holeClip: st.holeClip,
          stagePresent: st.stagePresent,
          popoverOpen: Boolean(pop && pop.getAttribute('data-open') === 'true'),
        };
      })()`,
      { timeoutMs: 5000 },
    );
    assert.ok(applied.skinAttr, 'data-agy-prism-skin must be set');
    assert.equal(applied.stagePresent, true, 'Wallpaper stage must be mounted');
    assert.ok(String(applied.holeClip || '').includes('path('), `Browser hole cutout clip-path expected, got: ${applied.holeClip}`);
    assert.equal(applied.popoverOpen, true, 'Quick Prism Popover must open cleanly');

    // Trigger 4x Esc instant panic strip
    const afterPanic = await evaluateTargetEphemeral(
      browser2.wsUrl,
      `(() => {
        for (let i = 0; i < 4; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
        return {
          skinAttr: document.documentElement.getAttribute('data-agy-prism-skin'),
          stage: Boolean(document.getElementById('agy-prism-stage')),
          style: Boolean(document.getElementById('agy-prism-css')),
        };
      })()`,
      { timeoutMs: 4000 },
    );
    assert.equal(afterPanic.skinAttr, null, '4x Esc must strip data-agy-prism-skin completely');
    assert.equal(afterPanic.stage, false, '4x Esc must remove wallpaper stage');
    assert.equal(afterPanic.style, false, '4x Esc must remove prism stylesheet');
  } finally {
    if (browser1) await browser1.close();
    if (browser2) await browser2.close();
    await new Promise((r) => mockHub.close(() => r()));
    await daemon.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
