// 兼容矩阵缓存（T3-3，方案 §4.5 / §4.1 的 store 层）：每次体检把结果按适配器记到
// 数据根目录的 compat.json（与「我的皮肤」skins 同级的共用位置，总控台的兼容矩阵页读它）。
// 文件形状：{ <adapterId>: { adapterId, appVersion, partsOk, partsMissing, contrast, mode, at } }
// ——字段即 §4.5 规定的记录（外加 mode，U-3 显示「兼容模式」黄点要用，属增补字段）。
// 读写都容错：文件坏了就当空，写失败不抛（体检结论本身比缓存重要，入口侧仍有 try/catch 兜底）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from '../core/env.mjs';

export function compatFile(baseDir = rootDir()) {
  return join(baseDir, 'compat.json');
}

export function readCompat(baseDir = rootDir()) {
  try {
    const j = JSON.parse(readFileSync(compatFile(baseDir), 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

// health 是 core/health.mjs 的 evaluateHealth 结果；appVersion 未知传 ''。
export function compatRecordOf(health, { adapterId, appVersion = '', at } = {}) {
  return {
    adapterId,
    appVersion: appVersion || '',
    partsOk: health.partsOk || [],
    partsMissing: health.partsMissing || [],
    contrast: health.contrast ?? null,
    mode: health.mode || 'full',
    at: at || new Date().toISOString(),
  };
}

export function writeCompatRecord(record, baseDir = rootDir()) {
  const all = readCompat(baseDir);
  all[record.adapterId] = record;
  mkdirSync(baseDir, { recursive: true });
  writeFileSync(compatFile(baseDir), JSON.stringify(all, null, 2), 'utf8');
  return all;
}
