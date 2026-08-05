/**
 * Startup splash window.
 *
 * ---------------------------------------------------------------------------
 * A SEPARATE WINDOW, NOT AN OVERLAY IN THE RENDERER
 * ---------------------------------------------------------------------------
 * The obvious implementation is a full-screen div inside the app that hides
 * itself when ready. It is also self-defeating: that div cannot paint until the
 * Next bundle has loaded, hydrated, and rendered — which is precisely the gap
 * the splash exists to cover. The founder would stare at an empty frame, then
 * see a splash, then see the app.
 *
 * A second BrowserWindow paints in tens of milliseconds because it loads one
 * HTML file, one small script, and a video. The main window loads concurrently,
 * hidden, and is revealed underneath when both are ready.
 *
 * ---------------------------------------------------------------------------
 * IT CANNOT TRAP THE USER, BY CONSTRUCTION
 * ---------------------------------------------------------------------------
 * Three independent guards, because this window sits between the founder and
 * their application and a bug here is indistinguishable from the app failing to
 * start:
 *
 *   1. `splashFinished` in the page resolves on every path — ended, decode
 *      error, absent source, autoplay refusal, or a deliberate skip.
 *   2. `waitForVideo` applies its own timeout, so a page that never loaded at
 *      all — and therefore never defined that promise — still resolves.
 *   3. `main.ts` holds a hard ceiling on the whole sequence and reveals the
 *      application regardless of what this module reports.
 *
 * No guard depends on another being correct.
 */

import { BrowserWindow } from 'electron';

/**
 * Longest this module will wait on the page before giving up on it.
 *
 * Sized against the shipped animation (10.0s) with headroom for a slow first
 * decode. It is a backstop for a page that failed to run its script, not a
 * playback budget — a healthy splash resolves on the `ended` event well inside
 * it, and `main.ts` carries the real ceiling.
 */
const VIDEO_TIMEOUT_MS = 14_000;

/**
 * Square, by design.
 *
 * ---------------------------------------------------------------------------
 * THE CROP IS INTENTIONAL, AND IT IS NOT SMALL
 * ---------------------------------------------------------------------------
 * `start.mp4` is 1920x1080 — 16:9. The window is square, and the page's
 * `object-fit: cover` scales the video by its shorter axis (the height) and
 * trims the excess width evenly from both sides:
 *
 *     1080 -> 360 logical (scale 1/3),  1920 -> 640 logical
 *     640 shown in 360  ->  280 logical px trimmed, 140 per side
 *
 * So roughly 44% of the frame's width is outside the window. That is a
 * deliberate composition choice rather than an accident: the splash reads as an
 * app mark rather than as a video player, and the source is authored so the
 * subject sits inside the central square.
 *
 * **Anything that must be seen belongs in the middle 1080x1080 of the frame.**
 * That is the constraint a replacement asset has to satisfy, and it is the one
 * thing worth checking before swapping the file.
 *
 * The trim is symmetric because `object-position` is the default 50% 50%, which
 * the page states explicitly so it cannot be tuned away by accident.
 *
 * 360 logical pixels. Electron sizes windows in logical pixels, so this is
 * correct on high-DPI displays with no scale factor applied anywhere.
 */
const SPLASH_SIZE = 360;

export interface Splash {
  window: BrowserWindow;
  /** Resolves when the animation is over, however it ended. Never rejects. */
  finished: Promise<void>;
}

/**
 * Create and show the splash.
 *
 * Returns null when the splash cannot be created for any reason, which the
 * caller treats as "show the application now". Nothing here is allowed to throw
 * into startup.
 */
export function createSplash(url: string): Splash | null {
  let window: BrowserWindow;

  try {
    window = new BrowserWindow({
      width: SPLASH_SIZE,
      height: SPLASH_SIZE,
      // Frameless and chromeless: this is an animation, not a document.
      frame: false,
      /*
       * Transparent, so the rounded corners are actually rounded.
       *
       * The radius is drawn in CSS, which only clips the page's own painting —
       * the native window underneath stays a rectangle. Without transparency
       * the corners would show the window's background colour and the effect
       * would be four lighter arcs on a dark square rather than a rounded
       * window.
       *
       * Costs: transparent windows cannot be resized on some platforms (this
       * one is `resizable: false` regardless), and on a Linux session with no
       * compositing window manager the transparency is ignored and the corners
       * render square. Degraded, never broken.
       */
      transparent: true,
      // `roundedCorners` is macOS-only and defaults to true; naming it makes
      // clear the CSS radius is the source of truth and this is not fighting it.
      roundedCorners: true,
      hasShadow: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      // Off the taskbar and app switcher — a transient window that appears
      // there looks like a second application the founder has to manage.
      skipTaskbar: true,
      center: true,
      show: false,
      /*
       * Fully transparent, not the app's canvas colour.
       *
       * An opaque background here paints the whole rectangle before the page
       * loads, which is exactly the square the corners are meant to remove. The
       * page draws its own dark surface inside the rounded container instead,
       * so the pre-decode flash is still avoided.
       */
      backgroundColor: '#00000000',
      // Above the main window while that one is still hidden. Released the
      // moment the application is revealed — see `dismiss`.
      alwaysOnTop: true,
      webPreferences: {
        // No preload, and therefore no bridge. The splash needs no host access:
        // it publishes a promise and the main process reads it.
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false,
        // Muted autoplay needs no gesture, but say so explicitly rather than
        // relying on the default staying this way.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
  } catch {
    return null;
  }

  /*
   * Shown only once the page is confirmed to BE the splash.
   *
   * `ready-to-show` would display whatever loaded, and the `app://` handler
   * falls back to `index.html` for any path it cannot resolve — so a build
   * missing `splash.html` put a 640x360 copy of the entire application on
   * screen for a third of a second before destroying it. Verifying the page
   * published `splashFinished` costs one round trip and removes that entirely.
   */
  const finished = window
    .loadURL(url)
    .then(
      () => true,
      () => false
    )
    .then(async (ok) => {
      if (!ok || window.isDestroyed()) return;

      const isSplash = await window.webContents
        .executeJavaScript('typeof window.splashFinished === "object"')
        .catch(() => false);

      if (!isSplash || window.isDestroyed()) {
        if (process.env.EIS_SMOKE === '1') {
          console.error('[smoke] splash page not present; starting without it');
        }
        if (!window.isDestroyed()) window.destroy();
        return;
      }

      window.show();
      await waitForVideo(window);
    });

  return { window, finished };
}

/**
 * Await the page's own completion promise, with a timeout of our own.
 *
 * `executeJavaScript` resolves with the awaited value when the expression is a
 * promise, which is the whole mechanism — the page reports completion without a
 * channel existing for it to report on.
 */
async function waitForVideo(window: BrowserWindow): Promise<void> {
  const started = Date.now();

  const page = window.webContents
    .executeJavaScript('window.splashFinished')
    .then((reason: unknown) => (typeof reason === 'string' ? reason : 'ended'))
    .catch(() => 'unavailable');

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), VIDEO_TIMEOUT_MS);
  });

  try {
    const reason = await Promise.race([page, timeout]);
    /*
     * Which gate released the splash, and how long it held.
     *
     * Only under EIS_SMOKE, because it is the one question that cannot be
     * answered by looking at the window — "the app appeared" is identical
     * whether the video played to its end or the backstop timer fired. On a
     * machine with no compositor the video never decodes, and without this line
     * a timeout run is indistinguishable from a healthy one.
     */
    if (process.env.EIS_SMOKE === '1') {
      console.error(`[smoke] splash resolved via "${reason}" after ${Date.now() - started}ms`);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fade the splash out and destroy it.
 *
 * `setOpacity` is Electron's own API for this and needs no cooperation from the
 * page, so the fade still runs if the renderer inside it has died. On a Linux
 * session without a compositing window manager it is a no-op and the window
 * simply closes — visibly abrupt, never broken.
 *
 * Always destroys, even if the fade throws part way. A splash that outlived its
 * own dismissal would sit on top of the application forever, which is the one
 * outcome this whole module is built to prevent.
 */
export async function dismiss(splash: Splash): Promise<void> {
  const { window } = splash;
  if (window.isDestroyed()) return;

  // Released before the fade so the application is interactive during it rather
  // than after it.
  try {
    window.setAlwaysOnTop(false);
  } catch {
    /* not fatal */
  }

  const STEPS = 12;
  const STEP_MS = 22;

  try {
    for (let i = STEPS - 1; i >= 0; i -= 1) {
      if (window.isDestroyed()) return;
      window.setOpacity(i / STEPS);
      await new Promise((resolve) => setTimeout(resolve, STEP_MS));
    }
  } catch {
    /* fall through to destroy */
  }

  if (!window.isDestroyed()) window.destroy();
}
