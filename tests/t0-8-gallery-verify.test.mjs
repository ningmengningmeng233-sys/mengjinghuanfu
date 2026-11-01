// T0-8 单测：构造四种主题包（store 方式 zip），三种坏包必须被拒绝且不落盘，好包正常导入。
// 数据目录用 DREAMSKIN_DATA_DIR 指到仓库 build/ 下的临时目录，不碰真实数据。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmpBase = join(root, 'build', 'test-gallery-data');
process.env.DREAMSKIN_DATA_DIR = join(tmpBase, 'cherry');

let gallery;
before(async () => {
  rmSync(tmpBase, { recursive: true, force: true });
  gallery = await import('../src/cherry/lib/gallery.mjs');
});

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
// 最小 zip 打包（store 不压缩）：只写 unzip() 会读的字段，CRC 填 0（gallery 的 unzip 不验 CRC）。
function zipStore(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nb = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nb, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nb);
    offset += 30 + nb.length + data.length;
  }
  const cdStart = offset;
  const cd = Buffer.concat(centrals);
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(Object.keys(files).length, 8); eo.writeUInt16LE(Object.keys(files).length, 10);
  eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...locals, cd, eo]);
}

const themeBuf = Buffer.from(JSON.stringify({ name: '测试主题', colors: { background: '#112233', text: '#eeeeee' }, appearance: 'dark', image: 'background.jpg' }), 'utf8');
const imgBuf = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99]); // 至少 12 字节，sniffExt 才认
const manifestFor = (files) => Buffer.from(JSON.stringify({ files: Object.entries(files).map(([path, data]) => ({ path, sha256: sha(data) })) }), 'utf8');
const dirOf = (id) => join(tmpBase, 'gallery', id);

test('manifest 缺失：拒绝且不落盘', () => {
  const id = 'ver_t0800001';
  const buf = zipStore({ 'theme.json': themeBuf, 'background.jpg': imgBuf });
  assert.throws(() => gallery.importThemePackage(buf, id), /manifest/);
  assert.ok(!existsSync(dirOf(id)));
});

test('哈希不匹配：拒绝且不落盘', () => {
  const id = 'ver_t0800002';
  const bad = Buffer.from(JSON.stringify({ files: [{ path: 'theme.json', sha256: '0'.repeat(64) }, { path: 'background.jpg', sha256: sha(imgBuf) }] }), 'utf8');
  const buf = zipStore({ 'manifest.json': bad, 'theme.json': themeBuf, 'background.jpg': imgBuf });
  assert.throws(() => gallery.importThemePackage(buf, id), /校验失败/);
  assert.ok(!existsSync(dirOf(id)));
});

test('含未登记文件：拒绝且不落盘', () => {
  const id = 'ver_t0800003';
  const files = { 'theme.json': themeBuf, 'background.jpg': imgBuf };
  const buf = zipStore({ 'manifest.json': manifestFor(files), ...files, 'extra.css': Buffer.from('body{}') });
  assert.throws(() => gallery.importThemePackage(buf, id), /未登记文件/);
  assert.ok(!existsSync(dirOf(id)));
});

test('好包：校验通过并正常导入', () => {
  const id = 'ver_t0800004';
  const files = { 'theme.json': themeBuf, 'background.jpg': imgBuf };
  const buf = zipStore({ 'manifest.json': manifestFor(files), ...files });
  const entry = gallery.importThemePackage(buf, id);
  assert.equal(entry.key, 'ds-' + id);
  assert.ok(existsSync(join(dirOf(id), 'info.json')));
  assert.ok(existsSync(join(dirOf(id), 'background.jpg')));
});
