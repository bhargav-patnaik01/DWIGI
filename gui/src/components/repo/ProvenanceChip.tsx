'use client';

import { cn } from '@/lib/utils';

/**
 * Provenance badge.
 *
 * Shows the value **verbatim** and colours it. Colour is presentation, not
 * interpretation — it makes a visual distinction the founder can already read in
 * the text, and it deliberately carries no consequence. The cockpit does not
 * decide that `inferred` caps confidence at Moderate; the advisor does, using
 * `reasoning_rules.md`.
 *
 * An unrecognised value renders neutrally rather than being coerced into a known
 * bucket, so a schema the cockpit has not seen still displays honestly.
 */
const TONE: Record<string, string> = {
  confirmed: 'border-positive/30 text-positive',
  corrected: 'border-positive/30 text-positive',
  imported: 'border-caution/30 text-caution',
  inferred: 'border-caution/40 text-caution',
  unknown: 'border-line text-faint',
};

export function ProvenanceChip({ value }: { value: string }) {
  const text = value.trim();
  if (!text || text === '—') return null;

  const tone = TONE[text.toLowerCase()] ?? 'border-line text-muted';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-px',
        'font-mono text-2xs leading-4',
        tone
      )}
    >
      {text}
    </span>
  );
}
