/*
 * Splash playback.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS TALKS TO THE MAIN PROCESS
 * ---------------------------------------------------------------------------
 * It does not. There is no preload, no IPC channel, and no exposed bridge on
 * this window — which matters, because a splash is the least-privileged surface
 * in the application and giving it a channel into the host would be the widest
 * possible attack surface for the smallest possible feature.
 *
 * Instead it publishes `window.splashFinished`, a promise. `electron/splash.ts`
 * awaits it with `executeJavaScript`, which resolves when the promise does.
 * One-way, no channel, nothing added to the preload bridge.
 *
 * ---------------------------------------------------------------------------
 * THE PROMISE ALWAYS RESOLVES
 * ---------------------------------------------------------------------------
 * Never rejects, and resolves on every path — played to the end, failed to
 * decode, no source at all, or skipped by the user. The main process treats
 * this as one of two gates on showing the application, so a promise that could
 * hang would be a promise that could hide the app forever. The host carries its
 * own independent timeout as well; this is the first of two guards, not the
 * only one.
 */

(() => {
  const stage = document.getElementById('stage');
  const clip = document.getElementById('clip');
  const waiting = document.getElementById('waiting');

  let settle;
  window.splashFinished = new Promise((resolve) => {
    settle = (reason) => {
      resolve(reason);
      // Idempotent: later events on a settled promise are inert, but stopping
      // playback keeps a skipped video from continuing to decode behind a
      // window that is already fading out.
      try {
        clip.pause();
      } catch {
        /* the element may already be gone */
      }
    };
  });

  /**
   * Reveal the stage once there is a frame to show.
   *
   * Without this the window paints its background first and the video pops in a
   * beat later, which reads as a stutter at the exact moment the application is
   * making its first impression.
   */
  const reveal = () => stage.setAttribute('data-ready', 'true');

  clip.addEventListener('loadeddata', reveal, { once: true });
  clip.addEventListener('ended', () => settle('ended'), { once: true });

  /*
   * Decode and source failures are ordinary outcomes, not errors to report.
   *
   * A missing file, a codec this build was not compiled with, a truncated
   * download — all of them mean the same thing to the user, which is that the
   * application should simply start.
   */
  clip.addEventListener('error', () => settle('error'), { once: true });
  clip.addEventListener('stalled', () => {}, { once: true });

  /**
   * Skip on any deliberate input.
   *
   * The animation is ten seconds long. A founder opening this application for
   * the fortieth time to ask one question should not be made to watch it, and
   * "wait for the video" as an absolute rule would turn a nice first impression
   * into a daily toll. Escape, Enter, Space, or a click all end it.
   *
   * This does not conflict with playing the video "exactly once" — it is never
   * looped, never replayed. It just does not have to be endured.
   */
  const skip = () => settle('skipped');
  window.addEventListener('keydown', (event) => {
    if (['Escape', 'Enter', ' ', 'Spacebar'].includes(event.key)) skip();
  });
  window.addEventListener('click', skip);

  /*
   * A patience indicator, shown only if it is warranted.
   *
   * It appears when the video has been running longer than most launches take
   * and the app still is not ready — never on a normal start. The brief asks for
   * no spinner unless initialization genuinely takes unusually long, and this is
   * that condition made concrete.
   */
  const PATIENCE_MS = 6000;
  setTimeout(() => waiting.setAttribute('data-visible', 'true'), PATIENCE_MS);

  /*
   * Autoplay can still be refused even when muted — some Linux builds ship
   * without the H.264 decoder, and `play()` rejects rather than firing `error`.
   * Treat a refusal as a finished splash.
   */
  const started = clip.play();
  if (started && typeof started.catch === 'function') {
    started.catch(() => settle('blocked'));
  }
})();
