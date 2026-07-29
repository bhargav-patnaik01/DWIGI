'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/button';
import { useUi } from '@/lib/store/ui';
import { hasHost } from '@/lib/utils';
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
 * Repository location, theme, two shell actions, Agent Management, and About.
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
    if (!hasHost()) return;
    let cancelled = false;
    void window.eis!.host.getInfo().then((info) => {
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
            label="Repository location"
            hint="The D.W.I.G.I repository directory. The advisor reads its
              operating instructions from here; the cockpit never writes to it."
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

          <Row label="Open repository" hint="Reveal the repository in your file manager.">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasHost() || !workspacePath}
              onClick={() => void window.eis?.repo.reveal('')}
            >
              Open
            </Button>
          </Row>

          <Row label="Open journal folder" hint="Reveal journal/ in your file manager.">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasHost() || !workspacePath}
              onClick={() => void window.eis?.repo.reveal('journal')}
            >
              Open
            </Button>
          </Row>

          <Row label="Runtime">
            <div className="text-right font-mono text-2xs leading-relaxed text-faint">
              {host ? (
                <>
                  <div>Electron {host.electronVersion}</div>
                  <div>{host.platform}</div>
                </>
              ) : (
                <div>Browser preview</div>
              )}
            </div>
          </Row>

          <AgentManagement />

          <p className="mt-8 text-[13px] leading-relaxed text-faint">
            This application is a presentation layer. It performs no reasoning, stores no
            business memory, and holds no business rules. Removing it leaves your
            repository entirely unaffected.
          </p>

          <About
            appVersion={host?.appVersion ?? null}
            repositoryUrl={host?.repositoryUrl ?? null}
          />
        </div>
      </div>
    </>
  );
}
