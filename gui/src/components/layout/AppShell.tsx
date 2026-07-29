'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { useRepo } from '@/lib/store/repo';
import { getAdvisorTransport } from '@/lib/advisor/transport';
import { Sidebar } from './Sidebar';
import { DevelopmentNotice } from './DevelopmentNotice';
import { DiagnosticsPanel } from '@/components/dev/DiagnosticsPanel';

/**
 * Application frame: theme application, global shortcuts, and the sidebar.
 *
 * Deliberately the only component that touches `document`, binds window-level
 * listeners, or asks the transport anything. Screens below it are pure
 * presentation, which is what keeps them trivial to test and reason about.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const theme = useUi((s) => s.theme);
  const workspacePath = useUi((s) => s.workspacePath);
  const attach = useRepo((s) => s.attach);
  const watch = useRepo((s) => s.watch);
  const [transportAvailable, setTransportAvailable] = useState(false);

  /*
   * Attach the repository once per launch, here rather than per screen.
   *
   * Every screen used to attach on mount, which was fine while they all merely
   * displayed projections. First-run detection changed that: Chat must know
   * whether `core/business_memory.md` exists *before* it decides which screen to
   * draw, and a snapshot that only arrives once the founder visits Memory would
   * mean the welcome flow depended on where they happened to navigate.
   *
   * The per-screen effects are unchanged and now no-op, since they attach only
   * when no snapshot exists yet.
   */
  useEffect(() => {
    if (!workspacePath) return;
    void attach(workspacePath);
    return watch();
  }, [attach, watch, workspacePath]);

  // Theme is a data attribute on <html>; Tailwind reads it via darkMode config.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  // Ask once, on mount. False in the browser preview, where there is no host.
  useEffect(() => {
    let cancelled = false;
    void getAdvisorTransport()
      .isAvailable()
      .then((ok) => {
        if (!cancelled) setTransportAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setTransportAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ⌘1–⌘5 / Ctrl+1–5 navigate. Bound from NAV so screens and shortcuts cannot
  // drift apart.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey || event.shiftKey) return;

      // Cmd/Ctrl+K is owned by the composer; do not treat it as navigation.
      if (event.key.toLowerCase() === 'k') return;

      const target = NAV.find((entry) => entry.shortcut === event.key);
      if (!target) return;

      event.preventDefault();
      router.push(target.href);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    // Column, so the notice spans the full width above the sidebar rather than
    // sitting inside one pane. It is a statement about the whole application.
    <div className="flex h-full flex-col overflow-hidden">
      <DevelopmentNotice />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar transportAvailable={transportAvailable} />
        {/* `relative` is load-bearing: the decision sheet overlays this pane with
            `absolute inset-0`, and without a positioning context here it would
            resolve against the viewport and cover the sidebar too. */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <DiagnosticsPanel />
    </div>
  );
}
