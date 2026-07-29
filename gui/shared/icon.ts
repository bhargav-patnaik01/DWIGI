/**
 * Icon resolution.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A PURE FUNCTION AND NOT THREE LINES INSIDE main.ts
 * ---------------------------------------------------------------------------
 * "A missing icon must not crash the application" is a claim worth a test, and a
 * function that calls `statSync` inside the Electron main process cannot be
 * exercised without an Electron process. Taking the existence predicate as an
 * argument makes the branch verifiable in plain Node.
 *
 * The ordering encodes which asset wins: the founder's own `icon.png` before any
 * derived or placeholder copy. Returning undefined is a first-class outcome —
 * Electron falls back to its default window icon, and a fresh clone with no icon
 * runs normally.
 */
export function resolveIconPath(
  candidates: readonly string[],
  exists: (path: string) => boolean
): string | undefined {
  for (const candidate of candidates) {
    let present = false;
    try {
      present = exists(candidate);
    } catch {
      // An unreadable path is a missing path as far as this decision goes. A
      // permissions error on one candidate must not stop the app from starting.
      present = false;
    }
    if (present) return candidate;
  }
  return undefined;
}
