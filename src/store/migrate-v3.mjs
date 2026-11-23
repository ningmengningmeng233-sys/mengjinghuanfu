// Read-only migrator for DreamSkin v3.0 legacy data (%LOCALAPPDATA%\DreamSkin\{gallery, skins}).
// Never modifies or deletes any file in legacyRoot. Idempotent via v4/migrated-v3.json marker.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function sniffImageExt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.readUInt32BE(0) === 0x89504e47) return '.png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf.toString('ascii', 0, 6) === 'GIF89a' || buf.toString('ascii', 0, 6) === 'GIF87a') return '.gif';
  return '';
}

function copyIntoUploads(srcImagePath, uploadDir, title, meta = {}) {
  const buf = readFileSync(srcImagePath);
  const ext = sniffImageExt(buf) || extname(srcImagePath).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return null;
  const sha = createHash('sha256').update(buf).digest('hex');
  const folder = join(uploadDir, `v3_${sha.slice(0, 16)}`);
  mkdirSync(folder, { recursive: true });
  const mediaFile = `wallpaper${ext}`;
  const destImage = join(folder, mediaFile);
  if (!existsSync(destImage)) {
    copyFileSync(srcImagePath, destImage);
  }
  const projectFile = join(folder, 'project.json');
  if (!existsSync(projectFile)) {
    writeFileSync(
      projectFile,
      JSON.stringify(
        {
          title: String(title || 'DreamSkin v3 Wallpaper').slice(0, 80),
          type: 'image',
          file: mediaFile,
          preview: mediaFile,
          tags: ['DreamSkin-v3', meta.source || 'migrated'],
          dreamskinV3: meta,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  }
  return {
    id: `v3_${sha.slice(0, 16)}`,
    sha256: sha,
    title: String(title || 'DreamSkin v3 Wallpaper').slice(0, 80),
    imagePath: destImage,
    folder,
    source: meta.source || 'v3',
  };
}

function findBackgroundImage(dir) {
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      if (/^background\.(jpg|jpeg|png|webp|gif)$/i.test(ent.name)) {
        return join(dir, ent.name);
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export function migrateV3DataIfNeeded({ legacyRoot, v4DataDir, uploadDir, force = false } = {}) {
  const markerPath = join(v4DataDir, 'migrated-v3.json');
  if (!force && existsSync(markerPath)) {
    return {
      migrated: false,
      alreadyMigrated: true,
      importedWallpapers: [],
      importedPresets: [],
      skipped: [],
    };
  }

  mkdirSync(v4DataDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });

  const importedWallpapers = [];
  const importedPresets = [];
  const skipped = [];

  if (legacyRoot && existsSync(legacyRoot)) {
    // 1. Read-only scan legacyRoot/gallery/<ver_*>
    const galleryDir = join(legacyRoot, 'gallery');
    if (existsSync(galleryDir)) {
      for (const ent of readdirSync(galleryDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name === 'thumbs') continue;
        const itemDir = join(galleryDir, ent.name);
        try {
          const infoPath = join(itemDir, 'info.json');
          if (!existsSync(infoPath)) {
            skipped.push({ path: itemDir, reason: 'missing info.json' });
            continue;
          }
          const info = JSON.parse(readFileSync(infoPath, 'utf8'));
          const bg = findBackgroundImage(itemDir);
          if (!bg) {
            skipped.push({ path: itemDir, reason: 'missing background image' });
            continue;
          }
          let themeMeta = {};
          const themePath = join(itemDir, 'theme.json');
          if (existsSync(themePath)) {
            try {
              themeMeta = JSON.parse(readFileSync(themePath, 'utf8'));
            } catch {
              themeMeta = {};
            }
          }
          const imported = copyIntoUploads(bg, uploadDir, info.name || ent.name, {
            source: 'v3-gallery',
            legacyId: ent.name,
            author: info.author || '',
            appearance: themeMeta.appearance || 'auto',
          });
          if (imported) importedWallpapers.push(imported);
          else skipped.push({ path: itemDir, reason: 'invalid image' });
        } catch (err) {
          skipped.push({ path: itemDir, reason: err?.message || 'corrupt gallery entry' });
        }
      }
    }

    // 2. Read-only scan legacyRoot/skins/*.json
    const skinsDir = join(legacyRoot, 'skins');
    if (existsSync(skinsDir)) {
      for (const ent of readdirSync(skinsDir, { withFileTypes: true })) {
        if (!ent.isFile() || !ent.name.endsWith('.json')) continue;
        const fp = join(skinsDir, ent.name);
        try {
          const skin = JSON.parse(readFileSync(fp, 'utf8'));
          if (skin?.schema !== 'dream-skin-user-skin/1') {
            skipped.push({ path: fp, reason: 'unknown schema' });
            continue;
          }
          let wpRef = null;
          if (skin.image && typeof skin.image === 'string') {
            const imgAbs = resolve(skinsDir, skin.image);
            if (imgAbs.startsWith(resolve(skinsDir)) && existsSync(imgAbs)) {
              wpRef = copyIntoUploads(imgAbs, uploadDir, skin.name || skin.id, {
                source: 'v3-user-skin',
                legacyId: skin.id || ent.name,
              });
              if (wpRef) importedWallpapers.push(wpRef);
            }
          }
          importedPresets.push({
            id: `v3-skin-${skin.id || ent.name.replace(/\.json$/, '')}`,
            name: String(skin.name || '我的皮肤').slice(0, 60),
            wallpaperId: wpRef?.id || '',
            themeMode: skin?.palette?.dark === false ? 'light' : 'dark',
            customAccent: typeof skin?.palette?.accent === 'string' ? skin.palette.accent : '',
          });
        } catch (err) {
          skipped.push({ path: fp, reason: err?.message || 'corrupt skin json' });
        }
      }
    }
  }

  const report = {
    version: 4,
    migratedAt: new Date().toISOString(),
    legacyRoot: legacyRoot || '',
    importedWallpapersCount: importedWallpapers.length,
    importedPresetsCount: importedPresets.length,
    skippedCount: skipped.length,
  };
  writeFileSync(markerPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  return {
    migrated: true,
    alreadyMigrated: false,
    importedWallpapers,
    importedPresets,
    skipped,
  };
}
