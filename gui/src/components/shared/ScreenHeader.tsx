'use client';

import { cn } from '@/lib/utils';

interface ScreenHeaderProps {
  title: string;
  /** One quiet line of context. Omit rather than pad. */
  subtitle?: string;
  actions?: React.ReactNode;
  /** Screens that own their own scrolling suppress the bottom border. */
  bare?: boolean;
}

/**
 * Consistent 48px header across every screen, matching the sidebar wordmark
 * height so the top edge of the app reads as one continuous line.
 */
export function ScreenHeader({ title, subtitle, actions, bare }: ScreenHeaderProps) {
  return (
    <header
      className={cn(
        'drag-region flex h-12 shrink-0 items-center gap-3 px-5',
        !bare && 'border-b border-line'
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="text-[13px] font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <span className="truncate text-2xs text-faint">{subtitle}</span>
        )}
      </div>
      {actions && <div className="no-drag ml-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}
