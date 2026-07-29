import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * True when running inside the Electron host rather than a plain browser.
 *
 * `npm run dev:web` opens the UI in a browser for fast visual iteration, where
 * `window.eis` is absent. Every host-dependent surface must tolerate that
 * instead of assuming the bridge exists.
 */
export function hasHost(): boolean {
  return typeof window !== 'undefined' && typeof window.eis !== 'undefined';
}
