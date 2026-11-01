// 壁纸瘦身：大图在 Cherry / ZCode 自己的渲染进程里用 canvas 缩到屏幕尺寸、转 WebP，结果缓存到
// %LOCALAPPDATA%\DreamSkin\cache\walls。原图不动；失败就原样返回，绝不影响换肤。
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { dataDir } from '../core/env.mjs';
import { imageDataUri, MAX_IMAGE_BYTES_CDP } from './cherry-skin-css.mjs';

export const SLIM_THRESHOLD = 700 * 1024; // 小于这个直接用原图
const cacheDir = () => join(dataDir('cherry'), '..', 'cache', 'walls');

export function cachedSlimPath(path) {
  const st = statSync(path);
  const h = createHash('sha1').update(resolve(path).toLowerCase() + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 16);
  return join(cacheDir(), h + '.webp');
}

// session: 已打开的 CdpSession（任意一个主窗口）。返回可以直接用的图片路径。
export async function slimImage(path, session) {
  if (!path) return '';
  try {
    if (statSync(path).size <= SLIM_THRESHOLD) return path;
    const out = cachedSlimPath(path);
    if (existsSync(out)) return out;
    if (!session) return path;
    const src = imageDataUri(path, MAX_IMAGE_BYTES_CDP);
    const b64 = await session.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
      const max = Math.min(3200, Math.max(1920, Math.round(Math.max(screen.width, screen.height) * (devicePixelRatio || 1))));
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const u = c.toDataURL('image/webp', 0.86);
      return u.startsWith('data:image/webp;base64,') ? u.slice(23) : '';
    })()`);
    if (!b64) return path;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length >= statSync(path).size) return path; // 没变小就别换
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(out, buf);
    return out;
  } catch { return path; }
}
