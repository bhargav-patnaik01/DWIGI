'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/button';
import { useUi } from '@/lib/store/ui';
import { hasHost } from '@/lib/utils';
import { getHostInfo } from '@/lib/host-info';
import type { HostInfo } from '@shared/host';
import { useRepo } from '@/lib/store/repo';
import { About, AgentManagement } from '@/components/settings/AgentManagement';

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-4 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Settings.
 *
 * Workspace, theme, two shell actions, Agent Management, and About.
 *
 * ---------------------------------------------------------------------------
 * ONE PREFERENCE HERE REACHES THE ENGINE, AND IT DOES SO EXPLICITLY
 * ---------------------------------------------------------------------------
 * Everything on this screen used to be inert by design — the cockpit is a viewer,
 * and a setting that silently changed how the advisor reasoned would make it a
 * participant. Agent Management is the deliberate exception: the founder decides
 * which executives the Council may engage, and that choice is transmitted as an
 * explicit command argument on turns they send.
 *
 * It stays a viewer because the choice is theirs, it is visible in the chat
 * header while it is in force, and the semantics live in the repository rather
 * than here.
 */
export default function SettingsPage() {
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const workspacePath = useUi((s) => s.workspacePath);
  const setWorkspacePath = useUi((s) => s.setWorkspacePath);
  const attach = useRepo((r) => r.attach);
  const [host, setHost] = useState<HostInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getHostInfo().then((info) => {
      if (!cancelled) setHost(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <ScreenHeader title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-reading px-6 py-6">
          <Row
            label="Workspace"
            hint="The folder holding everything about your business. Your board reads from
              it; this application never writes to it."
          >
            <div className="flex items-center gap-2">
              <span
                className="max-w-[240px] truncate font-mono text-2xs text-faint"
                title={workspacePath ?? undefined}
              >
                {workspacePath ?? 'Not set'}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasHost()}
                onClick={async () => {
                  const chosen = await window.eis?.host.selectDirectory();
                  if (chosen) { setWorkspacePath(chosen); void attach(chosen); }
                }}
              >
                Choose…
              </Button>
            </div>
          </Row>

          <Row label="Theme" hint="Dark is the design's primary target.">
            <Button size="sm" variant="outline" onClick={toggleTheme}>
              {theme === 'dark' ? (
                <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {theme === 'dark' ? 'Dark' : 'Light'}
            </Button>
          </Row>

          {/* Diagnostics is not in the sidebar — a founder needs it roughly never,
              and a permanent slot for a troubleshooting screen makes an
              application feel like a developer tool. Here is where someone looks
              once they have been asked for a bug report. */}
          <Row
            label="Diagnostics"
            hint="A shareable summary of this installation, for bug reports. Sign-in details and your account name are removed automatically."
          >
            <Link
              href="/diagnostics"
              className="inline-flex h-8 select-none items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-150 ease-quiet hover:bg-elevated"
            >
              Open
            </Link>
          </Row>

          <Row label="Open workspace folder" hint="Show this workspace in your file manager.">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasHost() || !workspacePath}
              onClick={() => void window.eis?.repo.reveal('')}
            >
              Open
            </Button>
          </Row>

          <Row label="Open decisions folder" hint="Show where your Decision Records are kept.">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasHost() || !workspacePath}
              onClick={() => void window.eis?.repo.reveal('journal')}
            >
              Open
            </Button>
          </Row>

          {/* The build row that used to sit here is gone: it led with "Electron
              34.5.8" and the raw platform token, which is the implementation
              rather than the product. About now carries all of it, with the
              application's own identity first and the toolchain behind a
              disclosure. Nothing was lost — Diagnostics is unchanged. */}

          <AgentManagement />

          <p className="mt-8 text-[13px] leading-relaxed text-faint">
            This application is a presentation layer. It performs no reasoning, stores no
            business memory, and holds no business rules. Removing it leaves your
            workspace entirely unaffected.
          </p>

          <About host={host} repositoryUrl={host?.repositoryUrl ?? null} />
        </div>
      </div>
    </>
  );
}
