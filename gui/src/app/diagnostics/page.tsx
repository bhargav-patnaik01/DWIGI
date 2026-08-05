'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { Button } from '@/components/ui/button';
import { CapabilityGrid } from '@/components/runtime/ProviderCard';
import { useRuntime, useActiveBrain } from '@/lib/store/runtime';
import { useUi } from '@/lib/store/ui';
import { useRepo } from '@/lib/store/repo';
import { describeRoutes, PROTOCOL } from '@shared/deeplink';
import { findLeaks, maskHandle, redactDeep, redactText } from '@shared/redact';
import type { HostInfo } from '@shared/host';
import { hasHost } from '@/lib/utils';
import { getHostInfo } from '@/lib/host-info';

/**
 * Diagnostics.
 *
 * ---------------------------------------------------------------------------
 * THIS SCREEN EXISTS TO BE PASTED INTO A BUG REPORT
 * ---------------------------------------------------------------------------
 * Which means everything on it is one keystroke from a public issue tracker. The
 * export runs through `shared/redact.ts` — key-based masking and value-shape
 * masking, both — and then through `findLeaks` as an independent second opinion.
 * If that second pass finds anything, the export is refused rather than shipped
 * with a warning: a founder who has been told "this might contain a secret" has
 * been handed a decision they have no way to make.
 *
 * This is also the only screen permitted to show internal names — folder paths,
 * file names, session handles — and only because the founder came here
 * deliberately to gather them.
 */
export default function DiagnosticsPage() {
  const workspacePath = useUi((s) => s.workspacePath);
  const theme = useUi((s) => s.theme);
  const snapshot = useRepo((s) => s.snapshot);
  const { providers, activeProviderId, refresh } = useRuntime();
  const active = useActiveBrain();

  const [host, setHost] = useState<HostInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    void getHostInfo().then(setHost);
  }, [refresh]);

  /**
   * The exportable report.
   *
   * Assembled raw, then redacted as one structure rather than field by field —
   * a per-field approach means every new field is a chance to forget, and the
   * fields most likely to be forgotten are the ones added in a hurry.
   */
  const report = useMemo(() => {
    const raw = {
      generatedBy: 'D.W.I.G.I diagnostics',
      application: {
        version: host?.appVersion ?? 'unknown',
        electron: host?.electronVersion ?? 'unknown',
        platform: host?.platform ?? 'unknown',
        development: host?.isDev ?? false,
        theme,
      },
      workspace: {
        selected: workspacePath !== null,
        // Redacted by `redactDeep` — the home-directory segment carries a name.
        path: workspacePath,
        memoryPresent: snapshot?.memoryPresent ?? null,
        memoryReadable: snapshot?.memory.ok ?? null,
        journalReadable: snapshot?.journal.ok ?? null,
        executivesReadable: snapshot?.executives.ok ?? null,
        executiveCount: snapshot?.executives.ok ? snapshot.executives.value.lenses.length : null,
        manifestProblem: snapshot?.executives.ok
          ? snapshot.executives.value.manifestError
          : null,
      },
      activeBrain: activeProviderId,
      providers: providers.map((provider) => ({
        id: provider.manifest.id,
        name: provider.manifest.displayName,
        verification: provider.manifest.verification,
        executionMode: provider.manifest.executionMode,
        councilCapable: provider.councilCapable,
        health: provider.health.state,
        healthMessage: provider.health.message ?? null,
        version: provider.health.version,
        latencyMs: provider.health.latencyMs ?? null,
        // `authState`/`authMethod` are exempt from masking: closed enums that
        // cannot carry a secret, and diagnostically essential.
        authState: provider.auth.state,
        authMethod: provider.auth.method,
        capabilities: provider.manifest.capabilities.states,
      })),
      deepLink: {
        scheme: `${PROTOCOL}://`,
        routes: describeRoutes().map((route) => route.url),
      },
    };

    return redactDeep(raw);
  }, [host, theme, workspacePath, snapshot, activeProviderId, providers]);

  const copy = useCallback(async () => {
    const serialised = JSON.stringify(report, null, 2);

    // Independent second opinion, deliberately re-derived rather than trusting
    // that redaction ran. A self-check sharing the caller's assumption checks nothing.
    const leaks = findLeaks(serialised);
    if (leaks.length > 0) {
      setExportError(
        `Export was stopped because the report still appears to contain sensitive values (${leaks.join(', ')}). This is a defect — please report it.`
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(serialised);
      setExportError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError('The report could not be copied to the clipboard.');
    }
  }, [report]);

  return (
    <>
      <ScreenHeader
        title="Diagnostics"
        subtitle="For bug reports"
        actions={
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-positive" strokeWidth={2} />
                Copied
              </>
            ) : (
              <>
                <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={2} />
                Copy report
              </>
            )}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-reading px-5 py-6">
          <p className="text-[13px] leading-relaxed text-muted">
            Everything below is safe to share. Sign-in details, keys, and your account
            name are removed automatically before the report is copied.
          </p>

          {exportError && (
            <p className="mt-4 rounded-xl border border-critical/30 bg-critical/5 px-3.5 py-3 text-[13px] leading-relaxed text-muted">
              {exportError}
            </p>
          )}

          <Section title="Application">
            <Row label="Version" value={host?.appVersion ?? '—'} />
            <Row label="Electron" value={host?.electronVersion ?? '—'} />
            <Row label="Operating system" value={host?.platform ?? '—'} />
            <Row label="Mode" value={host?.isDev ? 'Development' : 'Production'} />
          </Section>

          <Section title="Workspace">
            <Row
              label="Location"
              value={workspacePath ? redactText(workspacePath) : 'Not selected'}
              mono
            />
            <Row
              label="Business memory"
              value={
                snapshot?.memoryPresent
                  ? snapshot.memory.ok
                    ? 'Present and readable'
                    : 'Present but unreadable'
                  : 'Not created yet'
              }
            />
            <Row
              label="Executives"
              value={
                snapshot === null
                  ? '—'
                  : snapshot.executives.ok
                    ? `${snapshot.executives.value.lenses.length} loaded`
                    : snapshot.executives.reason
              }
            />
            <Row
              label="Decisions"
              value={
                snapshot === null
                  ? '—'
                  : snapshot.journal.ok
                    ? `${snapshot.journal.value.records.length} recorded`
                    : snapshot.journal.reason
              }
            />
          </Section>

          <Section title="Active AI">
            {active ? (
              <>
                <Row label="Name" value={active.manifest.displayName} />
                <Row label="Status" value={active.health.state} />
                <Row label="Version" value={active.health.version ?? '—'} />
                <Row
                  label="Response time"
                  value={active.health.latencyMs !== undefined ? `${active.health.latencyMs} ms` : '—'}
                />
                <Row label="Sign-in" value={active.auth.state} />
                <Row
                  label="Capability source"
                  value={
                    active.manifest.verification === 'verified-live'
                      ? 'Tested here'
                      : 'From vendor documentation — untested here'
                  }
                />
                <div className="mt-3 border-t border-line pt-3">
                  <CapabilityGrid provider={active} />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-faint">
                No AI has been selected to power the council.
              </p>
            )}
          </Section>

          <Section title="All AI">
            {providers.map((provider) => (
              <Row
                key={provider.manifest.id}
                label={provider.manifest.displayName}
                value={`${provider.health.state}${
                  provider.councilCapable ? '' : ' · conversation only'
                }`}
              />
            ))}
          </Section>

          <Section title="Deep links">
            <Row label="Scheme" value={`${PROTOCOL}://`} mono />
            {describeRoutes().map((route) => (
              <Row key={route.url} label={route.url} value={route.purpose} mono />
            ))}
          </Section>

          <p className="mt-8 text-2xs leading-relaxed text-faint">
            Conversation session handles are shortened in exports
            {hasHost() ? '' : ' (no host process is attached in this preview)'}
            {(() => {
              const masked = maskHandle(activeProviderId);
              return masked ? ` — for example, ${masked}.` : '.';
            })()}
          </p>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-2xs font-medium uppercase tracking-wider text-faint">{title}</h2>
      <div className="mt-2 rounded-xl border border-line bg-surface px-3.5 py-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4 border-b border-line py-2 last:border-0">
      <span className="w-40 shrink-0 text-[13px] text-faint">{label}</span>
      <span
        className={
          mono
            ? 'min-w-0 flex-1 break-all font-mono text-[13px] text-muted'
            : 'min-w-0 flex-1 text-[13px] text-muted'
        }
      >
        {value}
      </span>
    </div>
  );
}
