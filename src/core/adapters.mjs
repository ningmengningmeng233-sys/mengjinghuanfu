// Adapter loader (T1-2, plan 4.2): scans adapters/*/adapter.json, validates
// pure data, skips invalid adapters and collects their errors instead of
// crashing. No external dependencies (zero-dependency project rule).
// Since T1-3, adapter.json (+ parts-map.json / extra.css in the same
// directory) is the single source of app facts; core/app-runtime.mjs
// assembles the runtime profile from this data (core/apps.mjs is gone).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ADAPTER_SCHEMA = 'dreamskin-adapter/1';
export const CHANNELS = ['exe', 'msix', 'webview2', 'dsh-plugin', 'browser'];

export const DEFAULT_ADAPTERS_DIR = fileURLToPath(new URL('../adapters/', import.meta.url));

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ABS_WIN_PATH_RE = /^[A-Za-z]:[\\/]/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Recursively collect absolute Windows paths (drive letter or UNC) anywhere
// in the data. Paths must use %ENV% placeholders or be relative (plan 4.2).
function collectAbsolutePaths(value, trail, out) {
  if (typeof value === 'string') {
    if (ABS_WIN_PATH_RE.test(value) || value.startsWith('\\\\')) out.push(trail + ': ' + value);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v, i) => collectAbsolutePaths(v, trail + '[' + i + ']', out)); return; }
  if (isPlainObject(value)) { for (const [k, v] of Object.entries(value)) collectAbsolutePaths(v, trail ? trail + '.' + k : k, out); }
}

function checkRelativeFileField(data, field, dir, exists, errors) {
  const v = data[field];
  if (v === undefined) return;
  if (typeof v !== 'string' || !v) { errors.push(field + ' must be a non-empty string'); return; }
  if (ABS_WIN_PATH_RE.test(v) || v.startsWith('/') || v.startsWith('\\\\')) {
    errors.push(field + ' must be a path relative to the adapter directory: ' + v);
    return;
  }
  if (dir && !exists(join(dir, v))) errors.push(field + ' declares a file that does not exist: ' + v);
}

// Pure-data validation. opts: { dirName, dir, exists } - exists is injectable
// for tests. Returns an array of human readable error strings (empty = ok).
export function validateAdapter(data, opts = {}) {
  const exists = opts.exists || existsSync;
  const errors = [];
  if (!isPlainObject(data)) return ['adapter.json must contain a JSON object'];

  // Required common fields: id / name / schema / channel.
  if (typeof data.id !== 'string' || !ID_RE.test(data.id)) errors.push('id is required and must match ' + ID_RE);
  if (opts.dirName && typeof data.id === 'string' && data.id !== opts.dirName) {
    errors.push('id "' + data.id + '" does not match directory name "' + opts.dirName + '"');
  }
  if (typeof data.name !== 'string' || !data.name.trim()) errors.push('name is required (non-empty string)');
  if (data.schema !== ADAPTER_SCHEMA) errors.push('schema is required and must be "' + ADAPTER_SCHEMA + '"');
  if (!CHANNELS.includes(data.channel)) errors.push('channel is required and must be one of: ' + CHANNELS.join(' | '));

  // Absolute paths are forbidden anywhere (dev machine path lesson, T0).
  const abs = [];
  collectAbsolutePaths(data, '', abs);
  for (const a of abs) errors.push('absolute path is not allowed (use %ENV% placeholder or a relative path): ' + a);

  // discover block + channel specific required fields.
  const d = data.discover;
  if (d !== undefined && !isPlainObject(d)) errors.push('discover must be an object');
  const exeNamesOk = isPlainObject(d) && Array.isArray(d.exeNames) && d.exeNames.length > 0
    && d.exeNames.every((s) => typeof s === 'string' && s.length > 0);
  if (isPlainObject(d) && d.exeNames !== undefined && !exeNamesOk) errors.push('discover.exeNames must be a non-empty array of strings');
  if (isPlainObject(d) && d.candidates !== undefined
    && !(Array.isArray(d.candidates) && d.candidates.every((s) => typeof s === 'string'))) {
    errors.push('discover.candidates must be an array of strings');
  }
  if (isPlainObject(d) && d.envExe !== undefined && (typeof d.envExe !== 'string' || !ENV_NAME_RE.test(d.envExe))) {
    errors.push('discover.envExe must be an environment variable name');
  }
  if (data.channel === 'exe' || data.channel === 'webview2') {
    if (!exeNamesOk) errors.push('channel ' + data.channel + ' requires discover.exeNames (non-empty array)');
  }
  if (data.channel === 'msix') {
    if (!isPlainObject(d) || typeof d.msixPackageFamily !== 'string' || !d.msixPackageFamily) {
      errors.push('channel msix requires discover.msixPackageFamily');
    }
  }
  if (data.channel === 'browser') {
    if (!isPlainObject(data.target) || typeof data.target.urlPattern !== 'string' || !data.target.urlPattern) {
      errors.push('channel browser requires target.urlPattern');
    }
  }
  // dsh-plugin has no extra required fields in plan 4.2.

  // Optional blocks: check shapes when present.
  if (data.target !== undefined) {
    if (!isPlainObject(data.target)) errors.push('target must be an object');
    else for (const k of ['urlPattern', 'rejectPattern', 'uaToken']) {
      if (data.target[k] !== undefined && typeof data.target[k] !== 'string') errors.push('target.' + k + ' must be a string');
    }
  }
  if (data.process !== undefined && !isPlainObject(data.process)) errors.push('process must be an object');
  if (isPlainObject(data.process)) {
    if (data.process.helperCmdPattern !== undefined) {
      if (typeof data.process.helperCmdPattern !== 'string') errors.push('process.helperCmdPattern must be a string');
      else { try { new RegExp(data.process.helperCmdPattern); } catch { errors.push('process.helperCmdPattern is not a valid regular expression'); } }
    }
    if (data.process.gracefulCloseMs !== undefined
      && !(typeof data.process.gracefulCloseMs === 'number' && Number.isFinite(data.process.gracefulCloseMs) && data.process.gracefulCloseMs >= 0)) {
      errors.push('process.gracefulCloseMs must be a non-negative number');
    }
  }
  if (isPlainObject(d)) {
    for (const k of ['uninstallDisplayName', 'macBundle', 'msixPackageFamily']) {
      if (d[k] !== undefined && typeof d[k] !== 'string') errors.push('discover.' + k + ' must be a string');
    }
    if (d.uninstallDisplayNames !== undefined
      && !(Array.isArray(d.uninstallDisplayNames) && d.uninstallDisplayNames.length > 0 && d.uninstallDisplayNames.every((s) => typeof s === 'string' && s.length > 0))) {
      errors.push('discover.uninstallDisplayNames must be a non-empty array of strings');
    }
    // mac 段（mac 适配批）：{ bundle, source, status } 均为字符串；status 目前只许
    // unverified——mac 数据一律未实测，等真机验证批转正时再放开新取值。
    if (d.mac !== undefined) {
      if (!isPlainObject(d.mac)) errors.push('discover.mac must be an object');
      else {
        for (const k of ['bundle', 'source', 'status']) {
          if (d.mac[k] !== undefined && typeof d.mac[k] !== 'string') errors.push('discover.mac.' + k + ' must be a string');
        }
        if (d.mac.status !== undefined && d.mac.status !== 'unverified') {
          errors.push('discover.mac.status must be "unverified" (mac data is unverified by definition in this batch)');
        }
      }
    }
  }
  for (const k of ['restartNote', 'minVersion', 'userCssId']) {
    if (data[k] !== undefined && typeof data[k] !== 'string') errors.push(k + ' must be a string');
  }
  if (data.readySelector !== undefined && typeof data.readySelector !== 'string') errors.push('readySelector must be a string');
  if (data.probes !== undefined) {
    const okProbe = (p) => Array.isArray(p) && p.length >= 2 && p.length <= 3 && p.every((s) => typeof s === 'string');
    if (!Array.isArray(data.probes) || !data.probes.every(okProbe)) {
      errors.push('probes must be an array of [selector, label, requiredWhen?] string tuples');
    }
  }
  if (data.testedVersions !== undefined
    && !(Array.isArray(data.testedVersions) && data.testedVersions.every((s) => typeof s === 'string'))) {
    errors.push('testedVersions must be an array of strings');
  }
  if (data.conflicts !== undefined
    && !(Array.isArray(data.conflicts) && data.conflicts.every((s) => typeof s === 'string'))) {
    errors.push('conflicts must be an array of strings');
  }
  if (data.prism !== undefined) {
    if (!isPlainObject(data.prism)) errors.push('prism must be an object');
    else {
      if (data.prism.defaultDebugPort !== undefined
        && !(Number.isInteger(data.prism.defaultDebugPort) && data.prism.defaultDebugPort >= 1024 && data.prism.defaultDebugPort <= 65535)) {
        errors.push('prism.defaultDebugPort must be an integer port between 1024 and 65535');
      }
      if (data.prism.browserHoleSupport !== undefined && typeof data.prism.browserHoleSupport !== 'boolean') {
        errors.push('prism.browserHoleSupport must be a boolean');
      }
    }
  }
  // Optional shells list (A-2, plan A-2: one app hosted by several shells,
  // the channel is chosen per shell). Declarative only: a shell without
  // exeNames can never be auto-detected and stays an explicit choice.
  if (data.shells !== undefined) {
    if (!Array.isArray(data.shells)) errors.push('shells must be an array');
    else {
      const seen = new Set();
      data.shells.forEach((s, i) => {
        const at = 'shells[' + i + ']';
        if (!isPlainObject(s)) { errors.push(at + ' must be an object'); return; }
        if (typeof s.id !== 'string' || !ID_RE.test(s.id)) errors.push(at + '.id is required and must match ' + ID_RE);
        if (typeof s.id === 'string') {
          if (seen.has(s.id)) errors.push(at + '.id duplicates "' + s.id + '"');
          seen.add(s.id);
        }
        if (!CHANNELS.includes(s.channel)) errors.push(at + '.channel must be one of: ' + CHANNELS.join(' | '));
        if (s.name !== undefined && typeof s.name !== 'string') errors.push(at + '.name must be a string');
        if (s.exeNames !== undefined
          && !(Array.isArray(s.exeNames) && s.exeNames.length > 0 && s.exeNames.every((x) => typeof x === 'string' && x.length > 0))) {
          errors.push(at + '.exeNames must be a non-empty array of strings');
        }
        if (s.url !== undefined && typeof s.url !== 'string') errors.push(at + '.url must be a string');
      });
    }
  }

  checkRelativeFileField(data, 'partsMap', opts.dir, exists, errors);
  checkRelativeFileField(data, 'extraCss', opts.dir, exists, errors);
  return errors;
}

// Scan an adapters root directory. Returns { adapters, errors } where
// adapters is an array of valid adapter data objects (each with an added
// `adapterDir` property: its directory name) and errors is an array of
// { dir, id, errors } for skipped ones. Never throws on bad adapter data.
export function loadAdapters(dir = DEFAULT_ADAPTERS_DIR) {
  const adapters = [];
  const errors = [];
  let names = [];
  try { names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); }
  catch { return { adapters, errors }; }
  for (const name of names) {
    const sub = join(dir, name);
    const file = join(sub, 'adapter.json');
    if (!existsSync(file)) continue; // a directory without adapter.json is not an adapter
    let data;
    try { data = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { errors.push({ dir: name, id: null, errors: ['adapter.json is not valid JSON: ' + e.message] }); continue; }
    const errs = validateAdapter(data, { dirName: name, dir: sub });
    if (errs.length) { errors.push({ dir: name, id: isPlainObject(data) && typeof data.id === 'string' ? data.id : null, errors: errs }); continue; }
    adapters.push({ ...data, adapterDir: name });
  }
  return { adapters, errors };
}

export function listAdapters(dir = DEFAULT_ADAPTERS_DIR) {
  return loadAdapters(dir).adapters;
}

// Collected validation errors from the last scan shape (for V-C3 style
// reporting in logs / environment page). Returns [] when everything is fine.
export function adapterErrors(dir = DEFAULT_ADAPTERS_DIR) {
  return loadAdapters(dir).errors;
}

export function adapterById(id, dir = DEFAULT_ADAPTERS_DIR) {
  const { adapters } = loadAdapters(dir);
  const hit = adapters.find((a) => a.id === String(id || '').toLowerCase());
  if (!hit) {
    const known = adapters.map((a) => a.id).join(', ') || '(none)';
    throw new Error('Unknown adapter: ' + id + ' (registered: ' + known + ')');
  }
  return hit;
}
