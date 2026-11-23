import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAdapterPrismCss } from '../src/theme/prism-bridge.mjs';
import { getHostSkinScript, getHostPanelScript, buildClientSkinPayload } from '../src/prism/host/index.mjs';
import { appRuntimeById } from '../src/core/app-runtime.mjs';

test('prism-bridge: compiles all existing adapters parts-map to --prism-* CSS with scroll perf guardrail', () => {
  for (const appId of ['cherry', 'zcode', 'codex', 'dsh', 'minimax-code', 'minimax-design']) {
    const profile = appRuntimeById(appId);
    const out = compileAdapterPrismCss({
      appId,
      partsMap: profile.partsMap,
      extraCss: '',
      mode: 'full',
    });
    assert.equal(out.mode, 'full');
    assert.ok(out.coveredParts.length > 0, `${appId} should cover at least 1 semantic part`);
    assert.ok(out.adapterCss.includes('html[data-agy-prism-skin]'), `${appId} CSS must scope under Prism root attr`);
    assert.ok(out.adapterCss.includes('--prism-surface-'), `${appId} CSS must bind Prism glass surface tokens`);
  }

  // Verify Cherry chat.messages scrolling container NEVER receives backdrop-filter (scroll perf guardrail)
  const cherry = appRuntimeById('cherry');
  const full = compileAdapterPrismCss({ appId: 'cherry', partsMap: cherry.partsMap, mode: 'full' });
  const msgBlock = full.adapterCss.match(/\/\* part: chat\.messages \*\/[\s\S]*?(?=\/\* part:|$)/)?.[0] || '';
  assert.ok(msgBlock.includes('--prism-surface-chat'));
  assert.equal(msgBlock.includes('backdrop-filter'), false, 'chat.messages must not apply backdrop-filter');
});

test('prism-bridge: compat degrade mode retains safe transparent root only and drops fragile subparts', () => {
  const cherry = appRuntimeById('cherry');
  const compat = compileAdapterPrismCss({ appId: 'cherry', partsMap: cherry.partsMap, mode: 'compat' });
  assert.equal(compat.mode, 'compat');
  assert.deepEqual(compat.coveredParts, ['app.root']);
  assert.equal(compat.adapterCss.includes('chat.composer'), false);
  assert.ok(compat.adapterCss.includes('background-color: transparent !important'));
});

test('prism host: microkernel and payload builder support adapterProfile & #agy-prism-adapter-css lifecycle', () => {
  const skinJs = getHostSkinScript();
  const panelJs = getHostPanelScript();
  assert.ok(skinJs.includes('agy-prism-adapter-css'), 'wallpaper-inject.js must manage adapter style tag');
  assert.ok(skinJs.includes('adapterProfile'), 'wallpaper-inject.js must accept adapterProfile in applyPayload');
  assert.ok(panelJs.includes('__agyPrismPanel'));

  const payload = buildClientSkinPayload(
    { colorScheme: 'prism-default', layoutMode: 'islands' },
    { id: 'wp-1', kind: 'image', mediaUrl: '/t/r/0/a.png' },
    'http://127.0.0.1:45678',
    {
      adapterProfile: {
        appId: 'cherry',
        mode: 'full',
        adapterCss: 'html[data-agy-prism-skin] #app-sidebar { background: var(--prism-surface-sidebar) !important; }',
        browserHoleSupport: false,
      },
    },
  );
  assert.equal(payload.adapterProfile.appId, 'cherry');
  assert.equal(payload.adapterProfile.mode, 'full');
  assert.ok(payload.adapterProfile.adapterCss.includes('--prism-surface-sidebar'));
});
