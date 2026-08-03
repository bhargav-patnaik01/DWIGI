'use client';

import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { useChat } from '@/lib/store/chat';
import { useConversations } from '@/lib/store/conversations';
import { MemoryScopeBadge } from '@/components/chat/MemoryScopeBadge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NavItem } from './NavItem';
import { StatusPill } from './StatusPill';

interface SidebarProps {
  /** Resolved once by AppShell rather than probed per render. */
  transportAvailable: boolean;
}

export function Sidebar({ transportAvailable }: SidebarProps) {
  const pathname = usePathname();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const status = useChat((s) => s.status);
  // The conversation's own stored scope. Never the default setting — see the
  // note on `defaultMemoryScope` in the UI store.
  const activeMemory = useConversations((s) => s.activeMode.memory);
  const activeId = useConversations((s) => s.activeId);

  // Trailing-slash-tolerant match, since static export routes end in `/`.
  const isActive = (href: string) => {
    const here = pathname.replace(/\/+$/, '') || '/';
    return href === '/' ? here === '/' : here === href;
  };

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-line bg-surface',
        'transition-[width] duration-200 ease-quiet',
        collapsed ? 'w-[60px]' : 'w-[212px]'
      )}
    >
      {/* Wordmark doubles as the window drag region on macOS. The two
          `titlebar-*` classes are inert on every platform except darwin, where
          globals.css uses them to clear the traffic lights. */}
      <div
        className={cn(
          'drag-region flex h-12 shrink-0 items-center',
          collapsed ? 'titlebar-safe-collapsed justify-center' : 'titlebar-safe px-3.5'
        )}
      >
        {collapsed ? (
          <span className="font-mono text-[13px] font-semibold tracking-tight text-accent">
            D
          </span>
        ) : (
          <span className="text-[13px] font-semibold tracking-tight">
            D.W.I.G.I
            <span className="text-faint"> · Executive Council</span>
          </span>
        )}
      </div>

      <nav className={cn('flex flex-1 flex-col gap-0.5', collapsed ? 'px-2.5' : 'px-2')}>
        {NAV.map((entry) => (
          <NavItem
            key={entry.href}
            entry={entry}
            active={isActive(entry.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div
        className={cn(
          'flex shrink-0 flex-col gap-1 border-t border-line py-2',
          collapsed ? 'items-center px-2.5' : 'px-2'
        )}
      >
        {/* The active conversation's grounding, always visible.
            The header carries the same badge, but the header belongs to Chat —
            a founder reading Dashboard or Memory would otherwise have nothing on
            screen telling them which mode the thread they are about to return to
            is in. Shown only for Learning, matching the history list: the
            deviation is what needs stating. */}
        {activeId !== null && activeMemory === 'learning' && !collapsed && (
          <MemoryScopeBadge scope={activeMemory} variant="compact" className="self-start" />
        )}
        <StatusPill status={status} available={transportAvailable} collapsed={collapsed} />
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(!collapsed && 'self-start')}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          )}
        </Button>
      </div>
    </aside>
  );
}
