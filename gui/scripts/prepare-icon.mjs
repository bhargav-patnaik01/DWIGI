#!/usr/bin/env node
/**
 * Derive every icon artifact from the one source asset.
 *
 * ---------------------------------------------------------------------------
 * `gui/icon.png` IS THE ONLY AUTHORITY
 * ---------------------------------------------------------------------------
 * It is the founder's file, tracked in the repository, and nothing in this build
 * writes to it. Everything else is derived and disposable:
 *
 *   gui/icon.png  ──┬──►  build/icon.png    packaging input (electron-builder
 *                   │                       rasterises .ico / .icns from it)
 *                   └──►  public/icon.png   copied into the static export so the
 *                                           renderer can show the mark
 *
 * Both destinations are gitignored. A generated file that gets committed becomes
 * a second source of truth the moment the real icon changes and someone forgets
 * to re-run this — which is exactly the failure this layout prevents.
 *
 * ---------------------------------------------------------------------------
 * ABSENCE IS NOT AN ERROR
 * ---------------------------------------------------------------------------
 * A fresh clone has no icon. Development must work anyway, so a missing source
 * falls back to the placeholder generator, and a failure to generate is reported
 * and survived rather than thrown. `AppMark` independently falls back to a
 * typographic mark if the file never arrives, so no screen depends on this
 * having succeeded.
 *
 *   node scripts/prepare-icon.mjs
 */

import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const SOURCE = path.join(ROOT, 'icon.png');
const BUILD_ICON = path.join(ROOT, 'build', 'icon.png');
const BUILD_ICO = path.join(ROOT, 'build', 'icon.ico');
const PUBLIC_ICON = path.join(ROOT, 'public', 'icon.png');

/**
 * Sizes the assembled `.ico` must carry. Must match `scripts/icon-sizes.cjs`.
 *
 * The small end is the load-bearing part: electron-builder's own conversion
 * produced a lone 256x256 entry, and Windows Explorer — which draws icons at 16,
 * 32, and 48 — showed the packaged executable as blank.
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Read a PNG's IHDR dimensions. Null if it is not a readable PNG. */
async function pngSize(file) {
  try {
    const bytes = await readFile(file);
    if (bytes.length < 26 || bytes.subarray(1, 4).toString() !== 'PNG') return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/**
 * Rasterise `build/icon.png` through Electron.
 *
 * With `source`, normalises that image onto a square canvas; without one, draws
 * the placeholder. Resolves false rather than throwing — a machine that cannot
 * run this must still be able to run the app.
 */
function rasterise(source) {
  return new Promise((resolve) => {
    const binary =
      process.platform === 'win32'
        ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
        : path.join(ROOT, 'node_modules', '.bin', 'electron');

    const child = spawn(binary, [path.join(HERE, 'icon-main.cjs')], {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
      env: source ? { ...process.env, EIS_ICON_SOURCE: source } : process.env,
    });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * Assemble a multi-size `.ico` from PNG buffers.
 *
 * ICO is a directory of images. Since Vista each entry may hold a PNG rather than
 * a BMP, which is what makes this assemblable without an image library — the
 * bytes from `nativeImage.toPNG()` go in verbatim.
 *
 * Two field quirks the format demands: a 256-pixel dimension is written as 0
 * (the byte cannot hold 256), and the offsets are absolute from the start of the
 * file, so the whole directory must be sized before any image is placed.
 */
function assembleIco(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(ENTRY * images.length);
  let offset = HEADER + ENTRY * images.length;

  images.forEach(({ size, png }, index) => {
    const at = index * ENTRY;
    directory.writeUInt8(size >= 256 ? 0 : size, at); // width
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1); // height
    directory.writeUInt8(0, at + 2); // palette count — 0 for truecolour
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
}

/**
 * Build `build/icon.ico` from a source image. Resolves false on any failure.
 *
 * Best-effort by design: `package.json` names no explicit Windows icon, so
 * electron-builder falls back to `build/icon.png` when no `.ico` is present. A
 * machine that cannot run the rasteriser still packages, just with the icon
 * electron-builder derives itself.
 */
async function buildIco(source) {
  const binary =
    process.platform === 'win32'
      ? path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
      : path.join(ROOT, 'node_modules', '.bin', 'electron');

  const output = await new Promise((resolve) => {
    let stdout = '';
    const child = spawn(binary, [path.join(HERE, 'icon-sizes.cjs')], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      env: { ...process.env, EIS_ICON_SOURCE: source },
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', () => resolve(null));
    child.on('exit', () => resolve(stdout));
  });

  if (!output) return false;

  let parsed;
  try {
    // Electron prints unrelated diagnostics on some machines; take the JSON only.
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    return false;
  }

  if (!parsed.ok || !Array.isArray(parsed.images)) return false;

  const images = parsed.images.map(({ size, png }) => ({
    size,
    png: Buffer.from(png, 'base64'),
  }));

  // A partial set is the failure being fixed, so refuse rather than half-fix it.
  if (images.length !== ICO_SIZES.length) return false;

  await writeFile(BUILD_ICO, assembleIco(images));
  return images.map((image) => image.size);
}

async function main() {
  await mkdir(path.dirname(BUILD_ICON), { recursive: true });
  await mkdir(path.dirname(PUBLIC_ICON), { recursive: true });

  if (await exists(SOURCE)) {
    /*
     * The renderer gets the source untouched — the interface can letterbox an
     * image in CSS and should show exactly what was supplied.
     */
    await copyFile(SOURCE, PUBLIC_ICON);

    /*
     * Packaging is stricter. electron-builder rasterises `.ico` and `.icns` from
     * this one file and rejects a non-square source, so an icon that is not
     * already square is normalised onto a square canvas. A square source is
     * copied straight through, so the common case adds no rasteriser dependency.
     */
    const size = await pngSize(SOURCE);

    if (size && size.width === size.height) {
      await copyFile(SOURCE, BUILD_ICON);
      console.log(`icon     gui/icon.png (${size.width}x${size.height}) -> build/, public/`);
      const sizes = await buildIco(SOURCE);
      console.log(
        sizes
          ? `icon     build/icon.ico assembled at ${sizes.join(', ')}px`
          : 'icon     could not assemble build/icon.ico — electron-builder will derive one'
      );
      return;
    }

    const described = size ? `${size.width}x${size.height}` : 'unreadable dimensions';
    const normalised = await rasterise(SOURCE);

    if (normalised) {
      console.log(`icon     gui/icon.png (${described}) normalised to a square build icon`);
      const sizes = await buildIco(BUILD_ICON);
      console.log(
        sizes
          ? `icon     build/icon.ico assembled at ${sizes.join(', ')}px`
          : 'icon     could not assemble build/icon.ico — electron-builder will derive one'
      );
      return;
    }

    // Copy it through anyway. Development is unaffected, and packaging failing
    // loudly with electron-builder's own message beats this script inventing one.
    await copyFile(SOURCE, BUILD_ICON);
    console.log(
      `icon     gui/icon.png (${described}) is not square and could not be normalised — ` +
        'packaging may reject it'
    );
    return;
  }

  console.log('icon     gui/icon.png not present');

  if (!(await exists(BUILD_ICON))) {
    const made = await rasterise(null);
    if (!made) {
      /*
       * Deliberately exit 0. A developer without a rasteriser must still be able
       * to run the app, and the interface degrades on its own. Packaging will
       * fail loudly later if electron-builder finds no icon, which is the right
       * place for that to be a hard error.
       */
      console.log('icon     placeholder generation unavailable — continuing without an icon');
      return;
    }
    console.log('icon     generated a placeholder into build/icon.png');
  }

  await copyFile(BUILD_ICON, PUBLIC_ICON);
  console.log('icon     build/icon.png -> public/icon.png (placeholder)');
}

main().catch((error) => {
  console.error(`icon     unexpected failure: ${error.message}`);
  process.exit(0);
});
