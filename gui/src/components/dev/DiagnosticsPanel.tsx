'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AdvisorDiagnostics } from '@shared/advisor';
import { getAdvisorTransport } from '@/lib/advisor/transport';
import { useChat } from '@/lib/store/chat';
import { useUi } from '@/lib/store/ui';
import { useRepo } from '@/lib/store/repo';
import { Toggle } from '@/components/ui/toggle';

/**
 * Developer diagnostics — Ctrl/Cmd + Shift + D.
 *
 * ---------------------------------------------------------------------------
 * READ-ONLY BY CONSTRUCTION
 * ---------------------------------------------------------------------------
 * This panel must never affect runtime behaviour. Two properties enforce that:
 *
 *   1. It calls only `getDiagnostics()`, which is contractually side-effect free.
 *      It cannot open, send, cancel, or answer a permission — those methods are
 *      not referenced here at all.
 *   2. It polls only while visible, and stops on unmount. A hidden panel costs
 *      nothing, so leaving it closed is indistinguishable from it not existing.
 *
 * It reads store state directly rather than being handed props, so mounting it
 * changes no component's render path above it.
 */
export function DiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<AdvisorDiagnostics | null>(null);

  const status = useChat((s) => s.status);
  const sessionId = useChat((s) => s.sessionId);
  const pending = useChat((s) => s.pendingPermissions.length);
  const lastError = useChat((s) => s.lastError);
  const workspacePath = useUi((s) => s.workspacePath);
  const forceFirstRun = useUi((s) => s.devForceFirstRun);
  const setForceFirstRun = useUi((s) => s.setDevForceFirstRun);
  const snapshot = useRepo((s) => s.snapshot);
  const repoError = useRepo((s) => s.workspaceError);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Poll only while open.
  useEffect(() => {
    if (!open) return;
    let alive = true;

    const read = () => {
      void getAdvisorTransport()
        .getDiagnostics()
        .then((d) => {
          if (alive) setDiag(d);
        })
        .catch(() => {
          if (alive) setDiag(null);
        });
    };

    read();
    const id = setInterval(read, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open]);

  if (!open) return null;

  const rows: Array<[string, string]> = [
    ['Transport version', diag?.transportVersion ?? '—'],
    ['Connection', diag?.connected ? 'connected' : 'not connected'],
    ['Process state', diag?.processState ?? '—'],
    ['Session ID', diag?.sessionId ?? sessionId ?? '—'],
    ['Active repository', diag?.workspacePath ?? workspacePath ?? 'not set'],
    ['Working directory', diag?.workingDirectory ?? '—'],
    ['Runtime version', diag?.runtimeVersion ?? 'not detected'],
    ['Stream state', status],
    ['Last event', diag?.lastEventKind ?? '—'],
    [
      'Permission status',
      pending > 0
        ? `${pending} awaiting decision`
        : `none pending${diag?.pendingPermissionCount ? ` (${diag.pendingPermissionCount} grant handles)` : ''}`,
    ],
    [
      'File watch',
      repoError
        ? `error — ${repoError}`
        : snapshot
          ? `active · last read ${new Date(snapshot.memory.readAt).toLocaleTimeString()}`
          : 'not attached',
    ],
    ['Last error', lastError ?? 'none'],
    [
      'Business Memory',
      snapshot ? (snapshot.memoryPresent ? 'present' : 'absent — first run') : 'not read',
    ],
    [
      'Executive board',
      snapshot
        ? snapshot.executives.ok
          ? `${snapshot.executives.value.lenses.length} lenses` +
            (snapshot.executives.value.skipped.length > 0
              ? `, ${snapshot.executives.value.skipped.length} skipped`
              : '')
          : `unavailable — ${snapshot.executives.reason}`
        : 'not read',
    ],
    [
      'Routing manifest',
      snapshot
        ? snapshot.executives.ok
          ? (snapshot.executives.value.manifestError ?? 'joined')
          : 'not read'
        : 'not read',
    ],
  ];

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-50 w-[380px] animate-fade-up">
      <div className="overflow-hidden rounded-xl border border-line bg-canvas shadow-2xl">
        <div className="flex h-9 items-center justify-between border-b border-line px-3">
          <span className="font-mono text-2xs font-medium tracking-wide text-muted">
            DIAGNOSTICS
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close diagnostics"
            className="flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-elevated hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>

        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-3 px-3 py-1.5">
              <dt className="w-[130px] shrink-0 text-2xs text-faint">{label}</dt>
              <dd
                className="min-w-0 flex-1 truncate font-mono text-2xs text-ink/80"
                title={value}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {/*
          The one control in this panel, and it is deliberately here rather than in
          Settings — it is not a preference.

          It changes only which screen the cockpit draws. `/begin` still inspects
          `core/business_memory.md` itself and declines to re-run onboarding over a
          memory that exists, so forcing this against a real repository cannot
          damage anything. That is what makes it safe to ship rather than gate
          behind a build flag.
        */}
        <div className="flex items-start justify-between gap-3 border-t border-line px-3 py-2">
          <div className="min-w-0">
            <div className="text-2xs text-muted">Force first-run screen</div>
            <p className="mt-0.5 text-2xs leading-relaxed text-faint">
              Shows the welcome flow without touching Business Memory.
            </p>
          </div>
          <Toggle
            checked={forceFirstRun}
            onChange={setForceFirstRun}
            label="Force the first-run welcome screen"
          />
        </div>

        <p className="border-t border-line px-3 py-2 text-2xs leading-relaxed text-faint">
          Diagnostics are read-only and poll while visible only. The switch above
          affects this window&rsquo;s display, never session or repository state.
        </p>
      </div>
    </div>
  );
}
