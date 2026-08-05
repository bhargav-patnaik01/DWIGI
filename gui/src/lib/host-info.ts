'use client';

import type { HostInfo } from '@shared/host';
import { hasHost } from '@/lib/utils';

/**
 * Host facts, fetched once per launch.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Three screens asked the host for the same immutable record — the app version,
 * the Electron version, the platform, the repository URL — and each did it on
 * mount. Navigating Settings → Diagnostics → Settings issued four IPC
 * round-trips for a value that cannot change while the process is alive.
 *
 * None of that was slow enough to see. It was wasteful enough to be worth
 * removing, and the pattern is the kind that quietly multiplies: the fourth
 * screen to need `platform` would have added a fifth call.
 *
 * The promise is cached rather than the result, so concurrent mounts share one
 * in-flight request instead of racing to start their own.
 */
let pending: Promise<HostInfo | null> | null = null;

export function getHostInfo(): Promise<HostInfo | null> {
  if (pending) return pending;

  if (!hasHost()) {
    // The browser preview has no host. Cached as a resolved null so every caller
    // takes the same path and no screen special-cases the absence.
    pending = Promise.resolve(null);
    return pending;
  }

  pending = window
    .eis!.host.getInfo()
    // A failure is not cached as a rejection — that would make every later caller
    // throw for the lifetime of the process. Null degrades to "unknown" on screen,
    // which every consumer already renders.
    .catch(() => null);

  return pending;
}
