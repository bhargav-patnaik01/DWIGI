'use client';

import type { MemoryField } from '@shared/repo';
import { ProvenanceChip } from './ProvenanceChip';
import { cn } from '@/lib/utils';

const EMPTY = new Set(['', '—', 'unknown', 'not set']);

/**
 * One memory field.
 *
 * The value is rendered exactly as stored. `unknown` is shown as "Unknown" in
 * muted text rather than hidden or replaced with a placeholder — an unfilled
 * field is a legitimate, permanent state in this architecture, and concealing it
 * would misrepresent how much the advisor actually knows.
 *
 * The schema key is never shown. The founder sees a human label; keys are an
 * implementation detail that appears only in diagnostics.
 */
export function FieldRow({ field }: { field: MemoryField }) {
  const isEmpty = EMPTY.has(field.value.trim().toLowerCase());

  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr] gap-4 border-b border-line py-2.5 last:border-0">
      <div className="flex items-baseline gap-1.5 pt-px">
        <span className="text-[13px] text-muted">{field.label}</span>
        {field.required && (
          <span
            aria-hidden
            title="Required for grounded reasoning"
            className="text-accent/70 text-2xs leading-none"
          >
            ●
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={cn(
              'text-[13px] leading-relaxed',
              isEmpty ? 'italic text-faint' : 'text-ink'
            )}
          >
            {isEmpty ? 'Unknown' : field.value}
          </span>
          <ProvenanceChip value={field.provenance} />
        </div>

        {/* Confidence and date are shown as stored. No staleness is computed —
            whether a date is too old is a rule the advisor owns. */}
        {(field.confidence || field.updated) && !isEmpty && (
          <div className="mt-1 flex gap-3 font-mono text-2xs text-faint">
            {field.confidence && field.confidence !== '—' && (
              <span>confidence {field.confidence}</span>
            )}
            {field.updated && field.updated !== '—' && <span>updated {field.updated}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
