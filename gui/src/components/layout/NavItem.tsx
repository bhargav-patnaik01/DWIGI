'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { NavEntry } from '@/lib/nav';

interface NavItemProps {
  entry: NavEntry;
  active: boolean;
  collapsed: boolean;
}

export function NavItem({ entry, active, collapsed }: NavItemProps) {
  const Icon = entry.icon;

  return (
    <Link
      href={entry.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? entry.label : undefined}
      className={cn(
        'group relative flex h-9 items-center rounded-lg text-[13px] font-medium',
        'transition-colors duration-150 ease-quiet',
        collapsed ? 'w-9 justify-center' : 'gap-2.5 px-2.5',
        active ? 'bg-elevated text-ink' : 'text-muted hover:bg-elevated/60 hover:text-ink'
      )}
    >
      {/* Active marker: a 2px accent bar rather than a filled pill, so the
          sidebar stays quiet even with a selection present. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent',
          'transition-opacity duration-200 ease-quiet',
          active ? 'opacity-100' : 'opacity-0'
        )}
      />
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && (
        <>
          <span className="truncate">{entry.label}</span>
          <kbd
            className={cn(
              'ml-auto font-mono text-2xs text-faint opacity-0 transition-opacity',
              'group-hover:opacity-100'
            )}
          >
            ⌘{entry.shortcut}
          </kbd>
        </>
      )}
    </Link>
  );
}
