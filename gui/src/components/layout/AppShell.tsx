'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { useUi } from '@/lib/store/ui';
import { useRepo } from '@/lib/store/repo';
import { getAdvisorTransport } from '@/lib/advisor/transport';
import { Sidebar } from './Sidebar';
import { DevelopmentNotice } from './DevelopmentNotice';
import { DiagnosticsPanel } from '@/components/dev/DiagnosticsPanel';
import { PermissionGate } from '@/components/chat/PermissionGate';
import { hasHost } from '@/lib/utils';

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

  /*
   * Tell the host the interface is safe to show.
   *
   * ---------------------------------------------------------------------------
   * WHAT "READY" MEANS HERE, AND WHY IT IS NOT `useEffect` ALONE
   * ---------------------------------------------------------------------------
   * The window is hidden behind the startup animation until this fires, so the
   * definition matters: signalling too early defeats the splash, and the founder
   * sees an empty shell that then fills in.
   *
   * Ready means mounted AND, when a repository is configured, its first snapshot
   * read has settled — success or failure. That is the point at which a screen
   * shows its real content rather than its loading state. With no repository
   * there is nothing to wait for, so the shell is ready as soon as it mounts.
   *
   * ---------------------------------------------------------------------------
   * DO NOT PUT `requestAnimationFrame` BACK HERE
   * ---------------------------------------------------------------------------
   * The first version waited two animation frames before signalling, to reveal
   * over painted pixels rather than racing them. It deadlocked: the host keeps
   * this window hidden until the signal arrives, and Chromium does not run
   * animation frames in a window that has never been shown. The callback never
   * fired, the signal never sent, and every launch sat on the splash until the
   * host's 20-second ceiling rescued it.
   *
   * It degraded into "the app starts eventually", which is why it survived a
   * passing smoke run — the log line saying WHICH gate released the window is
   * what exposed it.
   *
   * A timeout is used instead: timers are not tied to painting. Waiting for
   * paint was never necessary anyway, since the host only shows a window that
   * has already emitted `ready-to-show`.
   *
   * Fires once. Not firing is survivable — the host reveals on its ceiling — but
   * firing early is not, which is why the gate is the snapshot and not the mount.
   */
  const signalled = useRef(false);
  const snapshot = useRepo((s) => s.snapshot);
  const workspaceError = useRepo((s) => s.workspaceError);

  useEffect(() => {
    if (signalled.current || !hasHost()) return;
    // Waiting on a repository that was never chosen would hold the splash for
    // the full timeout on a fresh install — the worst possible first launch.
    const settled = !workspacePath || snapshot !== null || workspaceError !== null;
    if (!settled) return;

    signalled.current = true;
    const timer = setTimeout(() => window.eis?.host.signalReady(), 0);
    return () => clearTimeout(timer);
  }, [snapshot, workspaceError, workspacePath]);

  // Theme is a data attribute on <html>; Tailwind reads it via darkMode config.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  /*
   * Publish the platform so CSS can adapt to it.
   *
   * Only macOS uses this today, to clear the traffic lights (globals.css). It is
   * an attribute rather than a conditional class in a component because it is a
   * property of the whole window, not of any one screen — and because a
   * component that branches on `platform === 'darwin'` starts collecting more of
   * them. Absent in the browser preview, where the selectors simply never match.
   */
  useEffect(() => {
    if (!hasHost()) return;
    let cancelled = false;
    void window.eis!.host.getInfo().then((info) => {
      if (!cancelled) document.documentElement.dataset.platform = info.platform;
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      {/* Above every screen: the engine is blocked application-wide, so the
          dialog that unblocks it must not belong to one route. */}
      <PermissionGate />
    </div>
  );
}
