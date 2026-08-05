import {
  LayoutDashboard,
  MessageSquare,
  Scale,
  Settings,
  BookMarked,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rendered in the sidebar as a keyboard hint and bound in AppShell. */
  shortcut: string;
}

/**
 * Single source of truth for navigation. The sidebar renders this and
 * AppShell binds the shortcuts from it, so a new screen cannot be added to one
 * without the other.
 *
 * Chat is first and is the index route: this is a conversation tool that
 * happens to have reference screens, not a dashboard that happens to have chat.
 */
export const NAV: readonly NavEntry[] = [
  { href: '/', label: 'Chat', icon: MessageSquare, shortcut: '1' },
  // Second, directly under Chat: the board is who answers, so it belongs beside
  // the conversation rather than filed away behind the reference screens.
  { href: '/executives', label: 'Executive Board', icon: Users, shortcut: '2' },
  // Third: which AI is thinking is a standing question a founder revisits, not a
  // setting they configure once. Filing it under Settings would bury the one
  // screen that explains why a runtime cannot host their board.
  { href: '/brains', label: 'AI', icon: Zap, shortcut: '3' },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '4' },
  { href: '/decisions', label: 'Decisions', icon: Scale, shortcut: '5' },
  { href: '/memory', label: 'Memory', icon: BookMarked, shortcut: '6' },
  { href: '/settings', label: 'Settings', icon: Settings, shortcut: '7' },
] as const;

/**
 * Screens reachable without a sidebar entry.
 *
 * Diagnostics is deliberately not in `NAV`: a founder needs it roughly never, and
 * a permanent sidebar slot for a troubleshooting screen makes an application feel
 * like a developer tool. It is reachable from Settings and by deep link, which is
 * where someone looks when they have been asked for a bug report.
 */
export const UNLISTED_ROUTES: readonly string[] = ['/diagnostics'];
