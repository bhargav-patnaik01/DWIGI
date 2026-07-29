'use client';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Say what is actually true and what would change it. Never filler. */
  description: string;
  action?: React.ReactNode;
}

/**
 * The honest-empty component.
 *
 * Most screens in this cockpit are empty on a fresh install, because the
 * repository legitimately starts without business memory or decision records.
 * That is a correct state, not a failure, and the copy passed here should say
 * what is missing and what would fill it rather than apologising or inventing
 * placeholder data.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center text-center animate-fade-up">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface">
          <Icon className="h-[18px] w-[18px] text-faint" strokeWidth={1.75} />
        </div>
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
