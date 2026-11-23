#!/usr/bin/env node
// Antigravity Sidecar Entrypoint for DreamSkin Prism v4.0.0.
// Uses single-daemon arbitration: becomes primary if none running, or transparently proxies
// to an existing standalone primary daemon so both UIs share one state with zero split-brain.
import { createServer, request as httpRequest } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const { startStudioDaemon } = await import(new URL('../../src/studio-daemon.mjs', import.meta.url));

const envPort = parseInt(
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT ||
    process.env.ANTIGRAVITY_SIDECAR_PORT ||
    process.env.PORT ||
    '0',
  10,
);
const listenPort = Number.isFinite(envPort) && envPort >= 0 ? envPort : 0;
const authToken = String(
  process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN ||
    process.env.ANTIGRAVITY_SIDECAR_AUTH_TOKEN ||
    process.env.ANTIGRAVITY_SIDECAR_WEB_TOKEN ||
    '',
).trim();

const daemon = await startStudioDaemon({
  port: listenPort,
  token: authToken,
  mode: 'sidecar',
  pluginRoot: PLUGIN_ROOT,
});

let proxyServer = null;
if (daemon.role === 'reuse') {
  // Primary standalone daemon is already alive on daemon.port; proxy this sidecar port cleanly to it.
  proxyServer = createServer((req, res) => {
    const headers = { ...req.headers };
    if (daemon.token) headers['x-sidecar-token'] = daemon.token;
    delete headers.host;
    const up = httpRequest(
      {
        host: '127.0.0.1',
        port: daemon.port,
        path: req.url || '/',
        method: req.method || 'GET',
        headers,
      },
      (upRes) => {
        res.writeHead(upRes.statusCode || 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    up.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Primary daemon unreachable: ' + err.message }));
      }
    });
    req.pipe(up);
  });
  await new Promise((r) => proxyServer.listen(listenPort, '127.0.0.1', r));
  console.log(`[dreamskin-prism] sidecar proxy on 127.0.0.1:${proxyServer.address().port} -> primary :${daemon.port}`);
} else {
  console.log(`[dreamskin-prism] primary sidecar on 127.0.0.1:${daemon.port} (media=${daemon.mediaOrigin})`);
}

const shutdown = async () => {
  if (proxyServer) {
    try { proxyServer.closeAllConnections?.(); } catch {}
    await new Promise((r) => proxyServer.close(() => r()));
  }
  await daemon.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
