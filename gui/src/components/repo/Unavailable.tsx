'use client';

import { FileQuestion } from 'lucide-react';

/**
 * The "Unavailable" state, used wherever a projection failed.
 *
 * Always states the *reason* the host reported rather than a generic apology. A
 * missing `business_memory.md` and an unparseable one are different situations
 * calling for different actions, and collapsing them into "no data" would hide
 * which one the founder is looking at.
 */
export function Unavailable({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      <FileQuestion className="mt-0.5 h-4 w-4 shrink-0 text-faint" strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-muted">{label} — Unavailable</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-faint">{reason}</p>
      </div>
    </div>
  );
}
