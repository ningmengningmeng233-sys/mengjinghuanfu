// Generalized Windows Shortcut (.lnk) Zero-Spawn Parser & Lossless Auto-Load Patcher (DreamSkin Prism v4).
// Works for Antigravity and all exe-channel adapters with reversible shortcut-backup.json.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { resolveDefaultPrismDataDir } from '../engine/store.mjs';
import { defaultPortForApp } from './gentle-cdp.mjs';

export function patchDebugArg(argsStr = '', port = 9339) {
  const safePort = Number.isInteger(Number(port)) && Number(port) >= 1024 && Number(port) <= 65535 ? Number(port) : 9339;
  const flag = `--remote-debugging-port=${safePort}`;
  const raw = String(argsStr || '').trim();
  if (!raw) return flag;
  if (/--remote-debugging-port(?:=\d+|\s+\d+)?/i.test(raw)) {
    return raw.replace(/--remote-debugging-port(?:=\d+|\s+\d+)?/gi, flag).replace(/\s{2,}/g, ' ').trim();
  }
  return `${raw} ${flag}`;
}

export function stripDebugArg(argsStr = '') {
  return String(argsStr || '')
    .replace(/(?:^|\s+)--remote-debugging-port(?:=\d+|\s+\d+)?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function readNullTerminatedAnsi(buf, start) {
  let end = start;
  while (end < buf.length && buf[end] !== 0) end += 1;
  return buf.subarray(start, end).toString('utf8');
}

function readNullTerminatedUtf16(buf, start) {
  let end = start;
  while (end + 1 < buf.length && (buf[end] !== 0 || buf[end + 1] !== 0)) end += 2;
  return buf.subarray(start, end).toString('utf16le');
}

export function parseWindowsLnkBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 76) return null;
  if (buf.readUInt32LE(0) !== 0x0000004c) return null;
  const linkFlags = buf.readUInt32LE(20);
  const isUnicode = (linkFlags & 0x00000080) !== 0;
  let offset = 76;

  if (linkFlags & 0x01) {
    if (offset + 2 > buf.length) return null;
    offset += 2 + buf.readUInt16LE(offset);
  }

  let targetPath = '';
  if (linkFlags & 0x02) {
    if (offset + 12 > buf.length) return null;
    const infoStart = offset;
    const infoSize = buf.readUInt32LE(infoStart);
    if (infoSize < 12 || infoStart + infoSize > buf.length) return null;
    const infoHeaderSize = buf.readUInt32LE(infoStart + 4);
    const infoFlags = buf.readUInt32LE(infoStart + 8);
    if (infoFlags & 0x01) {
      if (infoHeaderSize >= 0x24 && infoStart + 0x20 <= buf.length) {
        const uniOff = buf.readUInt32LE(infoStart + 0x1c);
        if (uniOff > 0 && infoStart + uniOff < infoStart + infoSize) {
          targetPath = readNullTerminatedUtf16(buf, infoStart + uniOff);
        }
      }
      if (!targetPath && infoStart + 20 <= buf.length) {
        const baseOff = buf.readUInt32LE(infoStart + 16);
        if (baseOff > 0 && infoStart + baseOff < infoStart + infoSize) {
          targetPath = readNullTerminatedAnsi(buf, infoStart + baseOff);
        }
      }
    }
    offset = infoStart + infoSize;
  }

  const readCountedString = () => {
    if (offset + 2 > buf.length) return '';
    const count = buf.readUInt16LE(offset);
    offset += 2;
    if (isUnicode) {
      const bytes = count * 2;
      const val = buf.subarray(offset, Math.min(buf.length, offset + bytes)).toString('utf16le');
      offset += bytes;
      return val;
    }
    const val = buf.subarray(offset, Math.min(buf.length, offset + count)).toString('utf8');
    offset += count;
    return val;
  };

  if (linkFlags & 0x04) readCountedString();
  const relativePath = linkFlags & 0x08 ? readCountedString() : '';
  const workingDirectory = linkFlags & 0x10 ? readCountedString() : '';
  const args = linkFlags & 0x20 ? readCountedString() : '';
  if (linkFlags & 0x40) readCountedString();

  if (!targetPath) {
    while (offset + 8 <= buf.length) {
      const blockSize = buf.readUInt32LE(offset);
      if (blockSize < 4 || offset + blockSize > buf.length) break;
      const sig = buf.readUInt32LE(offset + 4);
      if (sig === 0xa0000001 && blockSize >= 788) {
        targetPath = readNullTerminatedUtf16(buf, offset + 268) || readNullTerminatedAnsi(buf, offset + 8);
        break;
      }
      offset += blockSize;
    }
  }
  if (!targetPath && relativePath) targetPath = relativePath;

  return {
    targetPath: targetPath.trim(),
    arguments: args.trim(),
    workingDirectory: workingDirectory.trim(),
  };
}

function defaultShortcutRoots() {
  if (process.platform !== 'win32') return [];
  const home = homedir();
  const roaming = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const pub = process.env.PUBLIC || 'C:\\Users\\Public';
  return [
    { dir: join(home, 'Desktop'), location: 'desktop', maxDepth: 1, writable: true },
    { dir: join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), location: 'start-menu', maxDepth: 3, writable: true },
    {
      dir: join(roaming, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
      location: 'taskbar',
      maxDepth: 1,
      writable: true,
    },
    { dir: join(pub, 'Desktop'), location: 'public-desktop', maxDepth: 1, writable: false },
  ];
}

function collectLnkFiles(roots) {
  const seen = new Set();
  const out = [];
  const walk = (dir, location, writable, depth, maxDepth) => {
    let entries;
    try {
      if (!existsSync(dir)) return;
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (depth < maxDepth) walk(full, location, writable, depth + 1, maxDepth);
      } else if (ent.isFile() && /\.lnk$/i.test(ent.name)) {
        const key = full.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ path: full, name: ent.name, location, writable });
      }
    }
  };
  for (const r of roots) walk(r.dir, r.location, r.writable !== false, 1, r.maxDepth || 2);
  return out;
}

function readBackup(backupPath) {
  try {
    if (!existsSync(backupPath)) return { version: 4, entries: {} };
    const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && typeof parsed.entries === 'object') {
      return { version: 4, entries: { ...parsed.entries } };
    }
  } catch {}
  return { version: 4, entries: {} };
}

function writeBackup(backupPath, obj) {
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(
    backupPath,
    JSON.stringify({ version: 4, updatedAt: new Date().toISOString(), entries: obj.entries || {} }, null, 2) + '\n',
    'utf8',
  );
}

function runPowerShellEncoded(psScript, timeoutMs = 8000) {
  const powershell = process.env.SystemRoot
    ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell.exe';
  const wrapped = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; ${psScript}`;
  const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');
  return new Promise((resolvePromise, reject) => {
    execFile(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr ? String(stderr).trim() : err.message));
        else resolvePromise(String(stdout || '').trim());
      },
    );
  });
}

async function defaultWriteLnkUpdates(updates = []) {
  if (process.platform !== 'win32' || updates.length === 0) return [];
  const payloadB64 = Buffer.from(JSON.stringify(updates), 'utf8').toString('base64');
  const ps = `
    $items = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payloadB64}')) | ConvertFrom-Json;
    $ws = New-Object -ComObject WScript.Shell;
    $results = foreach ($it in $items) {
      try {
        $s = $ws.CreateShortcut([string]$it.path);
        if ($it.targetPath) { $s.TargetPath = [string]$it.targetPath; }
        if ($it.workingDirectory) { $s.WorkingDirectory = [string]$it.workingDirectory; }
        $s.Arguments = [string]$it.arguments;
        $s.Save();
        [pscustomobject]@{ path = [string]$it.path; ok = $true; error = '' }
      } catch {
        [pscustomobject]@{ path = [string]$it.path; ok = $false; error = $_.Exception.Message }
      }
    };
    ConvertTo-Json -InputObject @($results) -Compress
  `;
  const out = await runPowerShellEncoded(ps);
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function appExeNamesOf(app) {
  const names = [];
  if (app?.exeName) names.push(String(app.exeName));
  if (Array.isArray(app?.adapter?.discover?.exeNames)) {
    for (const n of app.adapter.discover.exeNames) names.push(String(n));
  }
  return [...new Set(names.filter(Boolean).map((n) => n.toLowerCase()))];
}

export async function inspectAppShortcuts({ app, port = 0, dataDir = '', searchDirs = null } = {}) {
  const resolvedDir = resolveDefaultPrismDataDir(dataDir);
  const backupPath = join(resolvedDir, 'shortcut-backup.json');
  const safePort = Number(port) > 0 ? Number(port) : defaultPortForApp(app?.id || 'antigravity');
  const exeNames = appExeNamesOf(app);
  const roots = Array.isArray(searchDirs)
    ? searchDirs.map((d) => ({ dir: resolve(d), location: 'custom', maxDepth: 2, writable: true }))
    : defaultShortcutRoots();
  const candidates = collectLnkFiles(roots);
  const backup = readBackup(backupPath);
  const shortcuts = [];

  for (const c of candidates) {
    let meta = null;
    try {
      meta = parseWindowsLnkBuffer(readFileSync(c.path));
    } catch {
      continue;
    }
    if (!meta || !meta.targetPath) continue;
    const targetBase = basename(meta.targetPath).toLowerCase();
    if (!exeNames.includes(targetBase)) continue;
    const isDedicated = /\(梦境换肤\)|\(prism\s*glass\)/i.test(c.name);
    const args = String(meta.arguments || '');
    const m = /--remote-debugging-port(?:=(\d+)|\s+(\d+))/i.exec(args);
    shortcuts.push({
      path: c.path,
      name: c.name,
      location: c.location,
      writable: c.writable,
      isNormalShortcut: !isDedicated,
      targetPath: meta.targetPath,
      arguments: args,
      hasDebugPort: Boolean(m),
      debugPort: m ? Number(m[1] || m[2]) : null,
      backedUp: Boolean(backup.entries[c.path.toLowerCase()]),
    });
  }

  const normalList = shortcuts.filter((s) => s.isNormalShortcut);
  const evalList = normalList.length > 0 ? normalList : shortcuts;
  const writableList = evalList.filter((s) => s.writable !== false);
  const patchedShortcuts = evalList.filter((s) => s.hasDebugPort).map((s) => s.path);
  const normalShortcutEnabled = writableList.length > 0
    ? writableList.every((s) => s.hasDebugPort)
    : patchedShortcuts.length > 0;

  return {
    supported: process.platform === 'win32' && app?.channel !== 'msix',
    appId: app?.id || '',
    port: safePort,
    normalShortcutEnabled,
    anyShortcutEnabled: patchedShortcuts.length > 0,
    shortcuts,
    patchedShortcuts,
    backupPath,
  };
}

export async function enableAppShortcutAutoLoad({
  app,
  port = 0,
  dataDir = '',
  searchDirs = null,
  writeLnkFn = defaultWriteLnkUpdates,
} = {}) {
  const resolvedDir = resolveDefaultPrismDataDir(dataDir);
  const backupPath = join(resolvedDir, 'shortcut-backup.json');
  const safePort = Number(port) > 0 ? Number(port) : defaultPortForApp(app?.id || 'antigravity');
  const before = await inspectAppShortcuts({ app, port: safePort, dataDir: resolvedDir, searchDirs });
  const backup = readBackup(backupPath);
  const updates = [];
  let alreadyPatchedCount = 0;

  for (const s of before.shortcuts.filter((x) => x.isNormalShortcut && x.writable)) {
    const key = s.path.toLowerCase();
    if (!backup.entries[key]) {
      backup.entries[key] = {
        appId: app?.id || '',
        path: s.path,
        originalArguments: s.hasDebugPort ? stripDebugArg(s.arguments) : s.arguments,
        targetPath: s.targetPath,
        backedUpAt: new Date().toISOString(),
      };
    }
    const nextArgs = patchDebugArg(s.arguments, safePort);
    if (nextArgs === s.arguments) alreadyPatchedCount += 1;
    else updates.push({ path: s.path, arguments: nextArgs });
  }

  writeBackup(backupPath, backup);
  const results = updates.length > 0 ? await writeLnkFn(updates) : [];
  const errors = results.filter((r) => !r.ok).map((r) => `${r.path}: ${r.error}`);
  const after = await inspectAppShortcuts({ app, port: safePort, dataDir: resolvedDir, searchDirs });
  return {
    ok: errors.length === 0,
    action: 'enabled',
    updatedCount: results.filter((r) => r.ok).length,
    alreadyPatchedCount,
    errors,
    ...after,
  };
}

export async function disableAppShortcutAutoLoad({
  app,
  port = 0,
  dataDir = '',
  searchDirs = null,
  writeLnkFn = defaultWriteLnkUpdates,
} = {}) {
  const resolvedDir = resolveDefaultPrismDataDir(dataDir);
  const backupPath = join(resolvedDir, 'shortcut-backup.json');
  const safePort = Number(port) > 0 ? Number(port) : defaultPortForApp(app?.id || 'antigravity');
  const before = await inspectAppShortcuts({ app, port: safePort, dataDir: resolvedDir, searchDirs });
  const backup = readBackup(backupPath);
  const updates = [];

  for (const s of before.shortcuts.filter((x) => x.writable)) {
    const key = s.path.toLowerCase();
    const b = backup.entries[key];
    const restoredArgs = b && typeof b.originalArguments === 'string'
      ? b.originalArguments
      : stripDebugArg(s.arguments);
    if (s.hasDebugPort || (b && restoredArgs !== s.arguments)) {
      updates.push({ path: s.path, arguments: restoredArgs });
    }
  }

  const results = updates.length > 0 ? await writeLnkFn(updates) : [];
  const errors = [];
  for (const r of results) {
    if (r.ok) delete backup.entries[String(r.path).toLowerCase()];
    else errors.push(`${r.path}: ${r.error}`);
  }
  writeBackup(backupPath, backup);
  const after = await inspectAppShortcuts({ app, port: safePort, dataDir: resolvedDir, searchDirs });
  return {
    ok: errors.length === 0,
    action: 'disabled',
    restoredCount: results.filter((r) => r.ok).length,
    errors,
    ...after,
  };
}
