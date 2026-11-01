// 运行环境：数据目录。所有路径都相对仓库或由环境变量覆盖，不写死任何本机目录。
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const CHERRY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 数据目录：默认 %LOCALAPPDATA%\DreamSkin\<app>，可用 DREAMSKIN_DATA_DIR 覆盖。
// 2.1 起按应用分目录：%LOCALAPPDATA%\DreamSkin\cherry、...\zcode；「我的皮肤」放在两端共用的 ...\DreamSkin\skins。
// DREAMSKIN_DATA_DIR 仍表示 Cherry 的目录（兼容旧用法），其它应用放在它的同级。
export function rootDir() {
  const base = process.env.DREAMSKIN_DATA_DIR ? dirname(resolve(process.env.DREAMSKIN_DATA_DIR))
    : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'DreamSkin')
    : join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'DreamSkin');
  mkdirSync(base, { recursive: true });
  return base;
}
export function dataDir(app = 'cherry') {
  const base = app === 'cherry' && process.env.DREAMSKIN_DATA_DIR ? resolve(process.env.DREAMSKIN_DATA_DIR) : join(rootDir(), app);
  mkdirSync(base, { recursive: true });
  return base;
}
