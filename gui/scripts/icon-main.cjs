/**
 * Icon rasteriser — writes the derived `build/icon.png`.
 *
 * ---------------------------------------------------------------------------
 * TWO MODES, ONE OUTPUT
 * ---------------------------------------------------------------------------
 * `EIS_ICON_SOURCE` set   — normalise the founder's own icon onto a square
 *                           canvas. Packaging needs square: electron-builder
 *                           rasterises `.ico` and `.icns` from this file, and a
 *                           non-square source is rejected outright.
 * `EIS_ICON_SOURCE` unset — draw a typographic placeholder, so a fresh clone
 *                           with no icon can still be built and run.
 *
 * ---------------------------------------------------------------------------
 * THE SOURCE IS NEVER TOUCHED
 * ---------------------------------------------------------------------------
 * `gui/icon.png` is the founder's file and the only authority on what this
 * application looks like. This script reads it and writes somewhere else. The
 * output lands in `build/`, which is gitignored, so the derived square copy
 * cannot become a second source of truth.
 *
 * Normalisation is deliberately mechanical — contain-fit and centre, nothing
 * else. No cropping, no recolouring, no background fill: each would be a design
 * decision, and design decisions about the icon belong to whoever supplied it.
 *
 * Uses Electron because it is already a dependency and rasterises properly.
 * Invoked by `scripts/prepare-icon.mjs`.
 */
const { app, BrowserWindow } = require('electron');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const SIZE = 512;
const OUT = path.join(__dirname, '..', 'build');
const SOURCE = process.env.EIS_ICON_SOURCE || null;

/**
 * Inline the source as a data URI rather than referencing it by path.
 *
 * The page itself is a `data:` document, which has an opaque origin and is
 * therefore forbidden from loading `file://` resources. A `file://` src silently
 * yields a blank image — and a blank 512×512 capture is a valid PNG, so it would
 * have shipped as the application icon with nothing reporting a problem.
 */
function inlineSource(file) {
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
}

/**
 * Padding around a normalised source icon.
 *
 * Desktop icons are composited against unpredictable backgrounds and cropped by
 * some launchers, so a glyph that reaches the edge of its canvas looks wrong in
 * about half the places it appears. 8% each side is the conventional safe area.
 */
const INSET = '8%';

const body = SOURCE
  ? `<img src="${inlineSource(SOURCE)}" style="
       max-width:calc(100% - ${INSET} * 2);
       max-height:calc(100% - ${INSET} * 2);
       object-fit:contain;
       image-rendering:auto">`
  : `<span style="
       font:700 250px ui-sans-serif,Segoe UI,system-ui,sans-serif;
       color:#f0a92e;letter-spacing:-14px;line-height:1;
       transform:translateY(-8px)">EI</span>`;

// A background only for the placeholder, which is its own complete design. A
// supplied icon is composited on transparency so its own shape is preserved.
const frame = SOURCE
  ? `width:${SIZE}px;height:${SIZE}px;box-sizing:border-box;
     display:flex;align-items:center;justify-content:center;`
  : `width:${SIZE}px;height:${SIZE}px;box-sizing:border-box;
     background:#111114;border:14px solid #1c1c21;border-radius:112px;
     display:flex;align-items:center;justify-content:center;`;

const HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px;background:transparent">
  <div style="${frame}">${body}</div>
</body></html>`)}`;

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false },
  });
  await win.loadURL(HTML);
  // The image decodes asynchronously inside the page; capturing too early yields
  // an empty frame.
  await new Promise((r) => setTimeout(r, 1500));
  const image = await win.webContents.capturePage();

  /*
   * Refuse to write a blank icon.
   *
   * A fully transparent capture is a perfectly valid PNG, so every check that
   * only asks "did this succeed" passes while the application ships with no mark
   * at all. Counting opaque pixels is the only assertion that actually catches it.
   */
  const bitmap = image.getBitmap();
  let opaque = 0;
  for (let i = 3; i < bitmap.length; i += 4) {
    if (bitmap[i] > 8) opaque += 1;
  }
  const coverage = opaque / (bitmap.length / 4);

  if (coverage < 0.01) {
    console.error(
      `icon     rasterised frame is blank (${(coverage * 100).toFixed(2)}% opaque) — not written`
    );
    app.exit(1);
    return;
  }

  writeFileSync(path.join(OUT, 'icon.png'), image.toPNG());
  console.log(
    `icon     ${SOURCE ? 'normalised' : 'placeholder'} -> build/icon.png ` +
      `(${SIZE}x${SIZE}, ${(coverage * 100).toFixed(1)}% opaque)`
  );
  app.quit();
});
