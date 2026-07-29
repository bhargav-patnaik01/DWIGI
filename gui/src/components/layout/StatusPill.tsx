'use client';

import { cn } from '@/lib/utils';
import type { TurnStatus } from '@shared/advisor';

interface StatusPillProps {
  status: TurnStatus;
  /** False when no runtime is reachable — distinct from being idle. */
  available: boolean;
  collapsed: boolean;
}

const COPY: Record<TurnStatus, string> = {
  idle: 'Ready',
  working: 'Thinking',
  'awaiting-permission': 'Needs approval',
  error: 'Error',
};

const DOT: Record<TurnStatus, string> = {
  idle: 'bg-positive',
  working: 'bg-accent animate-breathe',
  'awaiting-permission': 'bg-caution',
  error: 'bg-critical',
};

/**
 * Ambient state indicator in the sidebar footer.
 *
 * It reports transport state only. It never characterises what the advisor is
 * reasoning about — that would be the cockpit inventing insight it does not
 * have.
 */
export function StatusPill({ status, available, collapsed }: StatusPillProps) {
  const label = available ? COPY[status] : 'Not connected';
  const dot = available ? DOT[status] : 'bg-faint';

  return (
    <div
      className={cn(
        'flex h-8 items-center rounded-lg text-2xs',
        collapsed ? 'w-9 justify-center' : 'gap-2 px-2.5'
      )}
      title={collapsed ? label : undefined}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
      {!collapsed && <span className="truncate text-faint">{label}</span>}
    </div>
  );
}
