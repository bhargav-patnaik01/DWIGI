'use client';

import { BookOpen, Building2 } from 'lucide-react';
import type { MemoryScope } from '@shared/runtime-modes';
import { cn } from '@/lib/utils';

/**
 * What a conversation is grounded in, stated in one place.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COPY LIVES HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------
 * The header, the history list, and the sidebar all label the same property. If
 * each wrote its own wording they would drift, and the failure mode is specific
 * and bad: a founder reading advice believing it accounts for their runway when
 * it does not. One component, one vocabulary, three placements.
 *
 * The label names the *grounding*, not the feature. "Executive Learning" says
 * what the founder chose; "not reading your company record" is what it means,
 * and the second is what belongs in a title attribute they can hover for.
 */

const COPY: Record<MemoryScope, { label: string; short: string; hint: string }> = {
  business: {
    label: 'Business Advisor',
    short: 'Business',
    hint: 'Grounded in your Business Memory, journal, and calibration history.',
  },
  learning: {
    label: 'Executive Learning',
    short: 'Learning',
    hint: 'Reads nothing about your company — no memory, no journal, no calibration.',
  },
};

const ICON: Record<MemoryScope, typeof Building2> = {
  business: Building2,
  learning: BookOpen,
};

export function memoryScopeLabel(scope: MemoryScope): string {
  return COPY[scope].label;
}

export function MemoryScopeBadge({
  scope,
  variant = 'full',
  className,
}: {
  scope: MemoryScope;
  /** `full` for a labelled pill; `compact` for dense lists. */
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const copy = COPY[scope];
  const Icon = ICON[scope];
  const learning = scope === 'learning';

  return (
    <span
      title={copy.hint}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs',
        // Learning is the deviation, so it is the one that carries colour. A
        // badge that shouted on every conversation would stop being read on the
        // one where it matters.
        //
        // The quiet variant is `muted`, not `faint`. This badge names what the
        // advice is grounded in, which is the last thing that should recede into
        // the background — and on `elevated` the faint token measured 4.39:1,
        // the only contrast failure left after the token correction.
        learning
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-line bg-elevated text-muted',
        className
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {variant === 'full' ? copy.label : copy.short}
    </span>
  );
}
