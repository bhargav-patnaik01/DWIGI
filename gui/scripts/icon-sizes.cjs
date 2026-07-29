/**
 * Rasterise the source icon to every size a Windows shell asks for.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * electron-builder derives `icon.ico` from `build/icon.png` on its own, but from a
 * large square source it emitted a **single 256x256 entry**. Windows Explorer
 * renders list and detail views at 16, 32, and 48 pixels, and an `.ico` carrying
 * none of those shows as a blank icon — which is exactly how the packaged
 * executable appeared in Explorer.
 *
 * So the sizes are produced explicitly here and assembled into a multi-size
 * `.ico` by `prepare-icon.mjs`.
 *
 * Uses Electron's `nativeImage` because Electron is already a dependency and its
 * resizer is quality-aware. Writes PNG buffers to stdout as JSON so the caller
 * does not have to manage a directory of intermediates.
 *
 * Invoked by `scripts/prepare-icon.mjs`. Not useful on its own.
 */
const { app, nativeImage } = require('electron');

/** Sizes Windows actually requests, smallest first. */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const SOURCE = process.env.EIS_ICON_SOURCE;

app.whenReady().then(() => {
  try {
    if (!SOURCE) throw new Error('EIS_ICON_SOURCE is required');

    const source = nativeImage.createFromPath(SOURCE);
    if (source.isEmpty()) throw new Error(`could not decode ${SOURCE}`);

    const images = SIZES.map((size) => {
      // `quality: 'best'` matters most at 16px, where a naive downscale of a
      // detailed logo turns into noise.
      const resized = source.resize({ width: size, height: size, quality: 'best' });
      return { size, png: resized.toPNG().toString('base64') };
    });

    // stdout is the contract; anything else this process prints would corrupt it.
    process.stdout.write(JSON.stringify({ ok: true, images }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  }

  app.exit(0);
});
