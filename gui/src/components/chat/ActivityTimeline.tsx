'use client';

import { AlertCircle, Check, FileText, Play, Search, PenLine } from 'lucide-react';
import type { ActivityItem } from '@/lib/store/chat';
import { cn } from '@/lib/utils';

const ICON = {
  read: FileText,
  write: PenLine,
  search: Search,
  run: Play,
  other: FileText,
} as const;

/**
 * What the advisor actually did, in the order the runtime reported it.
 *
 * Every entry corresponds to a real emitted event. Nothing here is inferred — no
 * "activating CFO", no "consulting matrix", no synthesised reasoning steps. If
 * the runtime reported reading a file, this says so; if it reported nothing, this
 * shows nothing.
 *
 * The timeline exists because the advisor reads several files at boot, and
 * unexplained dead air reads as a frozen application.
 */
export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1 border-l border-line pl-3">
      {items.map((item) => {
        const Icon = item.state === 'failed' ? AlertCircle : ICON[item.category];
        return (
          <li key={item.id} className="flex items-center gap-2 text-2xs">
            <Icon
              className={cn(
                'h-3 w-3 shrink-0',
                item.state === 'failed' ? 'text-critical' : 'text-faint'
              )}
              strokeWidth={1.75}
            />
            <span
              className={cn(
                'truncate',
                item.state === 'failed' ? 'text-critical/80' : 'text-faint'
              )}
            >
              {item.label || 'Working'}
            </span>
            {item.state === 'started' && (
              <span className="h-1 w-1 animate-breathe rounded-full bg-accent" />
            )}
            {item.state === 'completed' && (
              <Check className="h-3 w-3 text-positive/60" strokeWidth={2} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
