'use client';

import { X } from 'lucide-react';
import { useUi } from '@/lib/store/ui';

/**
 * Standing V1 notice.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A BANNER AND NOT A ONE-TIME DIALOG
 * ---------------------------------------------------------------------------
 * A modal on first launch is acknowledged and forgotten inside a minute. This
 * sits above every screen until the founder actively closes it, so the caveat is
 * present while they are reading a recommendation rather than only before they
 * ever saw one.
 *
 * It is styled as information, not alarm. A cockpit that looks like it is
 * failing teaches the founder to ignore its warnings, which is the opposite of
 * what this notice is for.
 *
 * Dismissal is stored in the host's own preferences (`eis-cockpit-ui`), never in
 * the repository. Whether the founder has closed a banner is not a business
 * fact, and `core/` is not the cockpit's to write.
 */
export function DevelopmentNotice() {
  const dismissed = useUi((s) => s.noticeDismissed);
  const dismiss = useUi((s) => s.dismissNotice);

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-label="Product status notice"
      className="flex shrink-0 items-start gap-3 border-b border-caution/25 bg-caution/[0.07] px-4 py-2.5 sm:items-center"
    >
      <span
        aria-hidden
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-caution sm:mt-0"
      />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">
        <span className="font-medium text-ink">D.W.I.G.I is still in development.</span>{' '}
        This is V1, and AI advisors can make mistakes. Review important decisions carefully.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="no-drag -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-elevated hover:text-ink"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
