'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AppMarkProps {
  /** Rendered size in pixels. Square. */
  size?: number;
  className?: string;
}

/**
 * The application mark.
 *
 * ---------------------------------------------------------------------------
 * ONE SOURCE ASSET, AND IT IS ALLOWED TO BE ABSENT
 * ---------------------------------------------------------------------------
 * `gui/icon.png` is the founder's own file and the only authority on what this
 * application looks like. The build copies it to `public/icon.png` so the
 * renderer can reach it; nothing here draws, generates, or substitutes artwork
 * that competes with it.
 *
 * It may legitimately not be there — a fresh clone has no icon until someone
 * adds one — so a load failure falls back to a typographic mark rather than a
 * broken image. Development must not depend on a binary asset existing.
 */
export function AppMark({ size = 56, className }: AppMarkProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-[22%] border border-line bg-elevated',
          className
        )}
        style={{ width: size, height: size }}
      >
        <span
          className="font-mono font-semibold tracking-tighter text-accent"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          EI
        </span>
      </div>
    );
  }

  return (
    /*
     * A plain <img>, not next/image: the export is static, images are
     * unoptimized, and next/image has no error hook this fallback can hang off.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon.png"
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn('rounded-[22%]', className)}
      style={{ width: size, height: size }}
    />
  );
}
