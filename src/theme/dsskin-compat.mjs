// Legacy .dsskin (dream-skin-share/1 JSON) importer for DreamSkin Prism v4.
// Strictly validates schema, sanitizes title, sniffs image magic bytes, and writes nothing on rejection.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 25 * 1024 * 1024;
const SHARE_SCHEMA = 'dream-skin-share/1';

function sniffImageExt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.readUInt32BE(0) === 0x89504e47) return '.png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return '';
}

function decodeImageDataUri(raw) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(String(raw || '').trim());
  if (!m) return null;
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;
  const ext = sniffImageExt(buf);
  if (!ext) return null;
  return { buf, ext };
}

export function importLegacyDsskin({ filePath, rawText = '', uploadDir } = {}) {
  try {
    const text = rawText || readFileSync(filePath, 'utf8');
    if (text.length > MAX_BYTES * 2) return { ok: false, error: '文件过大，超过导入上限' };
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!parsed || typeof parsed !== 'object' || parsed.schema !== SHARE_SCHEMA) {
      return { ok: false, error: '不是有效的 .dsskin 皮肤文件（缺少 schema 标识）' };
    }

    const title = String(parsed.name || '导入的旧皮肤')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\.\./g, '')
      .trim()
      .slice(0, 60);
    if (!title) return { ok: false, error: '皮肤名称为空或无效' };

    let decoded = null;
    if (parsed.imageData) {
      decoded = decodeImageDataUri(parsed.imageData);
      if (!decoded) return { ok: false, error: '内嵌壁纸损坏或不是有效的 JPG / PNG / WebP' };
    }

    let imagePath = '';
    let id = '';
    if (decoded && uploadDir) {
      const sha = createHash('sha256').update(decoded.buf).digest('hex');
      id = `dsskin_${sha.slice(0, 16)}`;
      const folder = join(uploadDir, id);
      mkdirSync(folder, { recursive: true });
      const fileName = `wallpaper${decoded.ext}`;
      imagePath = join(folder, fileName);
      if (!existsSync(imagePath)) writeFileSync(imagePath, decoded.buf);
      writeFileSync(
        join(folder, 'project.json'),
        JSON.stringify({ title, type: 'image', file: fileName, preview: fileName, tags: ['dsskin'] }, null, 2) + '\n',
        'utf8',
      );
    }

    const isLight = parsed?.palette?.dark === false;
    const scrimVal = Number(parsed?.values?.scrim);
    const scrimOpacity = Number.isFinite(scrimVal)
      ? Math.max(0.08, Math.min(0.85, Math.round((scrimVal / 255) * 100) / 100))
      : 0.28;
    const customAccent = typeof parsed?.palette?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.palette.accent)
      ? parsed.palette.accent
      : '';

    return {
      ok: true,
      id: id || `dsskin_${Date.now().toString(36)}`,
      title,
      imagePath,
      suggestedConfig: {
        themeMode: isLight ? 'light' : 'dark',
        scrimOpacity,
        ...(customAccent ? { accentMode: 'custom', customAccent } : {}),
      },
    };
  } catch (err) {
    return { ok: false, error: err?.message || '解析 .dsskin 文件失败' };
  }
}
