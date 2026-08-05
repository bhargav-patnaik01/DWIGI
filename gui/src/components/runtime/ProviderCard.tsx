'use client';

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleSlash,
  Loader2,
  Minus,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { ProviderSnapshot } from '@shared/runtime/contract';
import {
  CAPABILITY_LABELS,
  CAPABILITY_ORDER,
  stateOf,
  type Capability,
} from '@shared/runtime/capabilities';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * One AI provider, as a card.
 *
 * ---------------------------------------------------------------------------
 * THIS CARD NEVER ASSERTS ANYTHING THE HOST DID NOT SAMPLE
 * ---------------------------------------------------------------------------
 * Health, authentication, and version all come from the snapshot. Where a value
 * has not been sampled it reads "Not checked" rather than a plausible default —
 * a card showing "Healthy" because nothing had been measured would be the same
 * class of fabrication the Executive Board refuses when it declines to claim
 * which lens is thinking.
 *
 * Capability rows render three states, never two. `unknown` is drawn distinctly
 * from `unsupported` because they mean different things and the whole gating
 * system depends on the founder being able to see which is which.
 */

interface ProviderCardProps {
  provider: ProviderSnapshot;
  busy: boolean;
  onTest(): void;
  onMakeActive(): void;
  onDisconnect(): void;
  onSubmitKey(secret: string): Promise<{ ok: boolean; reason?: string }>;
  /** Compact form for the onboarding step; full form for the Control Center. */
  variant?: 'full' | 'compact';
}

const HEALTH_TONE: Record<string, string> = {
  healthy: 'text-positive',
  degraded: 'text-caution',
  unhealthy: 'text-critical',
  absent: 'text-faint',
  unknown: 'text-faint',
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: 'Ready',
  degraded: 'Needs attention',
  unhealthy: 'Not responding',
  absent: 'Not installed',
  unknown: 'Not checked',
};

const AUTH_LABEL: Record<string, string> = {
  'not-required': 'No sign-in needed',
  delegated: 'Managed by the app itself',
  unauthenticated: 'Not connected',
  pending: 'Signing in…',
  authenticated: 'Connected',
  invalid: 'Sign-in rejected',
  expired: 'Sign-in expired',
};

export function ProviderCard({
  provider,
  busy,
  onTest,
  onMakeActive,
  onDisconnect,
  onSubmitKey,
  variant = 'full',
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { manifest, health, auth, active, councilCapable, councilBlockedReason } = provider;
  const needsKey = manifest.authMethods.includes('osCredentialStore');
  const installed = health.state !== 'absent';

  const submit = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setKeyError(null);
    const result = await onSubmitKey(key.trim());
    setSaving(false);
    if (result.ok) {
      // Cleared on success so the secret does not sit in a React state tree any
      // longer than the round-trip needs it to.
      setKey('');
    } else {
      setKeyError(result.reason ?? 'That key was not accepted.');
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface transition-colors duration-150 ease-quiet',
        active ? 'border-accent/50' : 'border-line'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            active ? 'border-accent/40 bg-accent/10' : 'border-line bg-elevated'
          )}
        >
          <Zap
            className={cn('h-4 w-4', active ? 'text-accent' : 'text-faint')}
            strokeWidth={1.75}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-medium text-ink">{manifest.displayName}</span>
            {active && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-medium text-accent">
                Active Brain
              </span>
            )}
            {!councilCapable && (
              <span className="rounded-full border border-line px-2 py-0.5 text-2xs text-faint">
                Conversation only
              </span>
            )}
          </div>

          <p className="mt-1 text-[13px] leading-relaxed text-muted">{manifest.summary}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
            <span className={cn('font-medium', HEALTH_TONE[health.state] ?? 'text-faint')}>
              {HEALTH_LABEL[health.state] ?? 'Not checked'}
            </span>
            <span className="text-faint">{AUTH_LABEL[auth.state] ?? auth.state}</span>
            {health.version && <span className="tabular text-faint">{health.version}</span>}
            {health.latencyMs !== undefined && (
              <span className="tabular text-faint">{health.latencyMs} ms</span>
            )}
          </div>

          {health.message && (
            <p className="mt-2 text-[13px] leading-relaxed text-faint">{health.message}</p>
          )}

          {/*
            The single most important sentence on this screen for a founder who
            picked a provider that cannot run their board. It names the
            consequence, not the conclusion.
          */}
          {!councilCapable && councilBlockedReason && (
            <p className="mt-2 rounded-lg border border-line bg-elevated px-3 py-2 text-[13px] leading-relaxed text-muted">
              {councilBlockedReason}
            </p>
          )}

          {auth.message && (
            <p className="mt-2 text-[13px] leading-relaxed text-faint">{auth.message}</p>
          )}

          {needsKey && auth.state !== 'authenticated' && (
            <div className="mt-3">
              <label className="text-2xs text-faint" htmlFor={`key-${manifest.id}`}>
                API key
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id={`key-${manifest.id}`}
                  type="password"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submit();
                  }}
                  placeholder="Paste your key"
                  spellCheck={false}
                  autoComplete="off"
                  className={cn(
                    'h-8 flex-1 rounded-lg border border-line bg-canvas px-2.5',
                    'text-[13px] text-ink placeholder:text-faint',
                    'focus:outline-none focus:ring-2 focus:ring-accent/60'
                  )}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void submit()}
                  disabled={saving || !key.trim()}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
              <p className="mt-1.5 text-2xs leading-relaxed text-faint">
                Stored in this computer&rsquo;s secure keychain. It is never shown again and
                never leaves your machine except to {manifest.displayName}.
              </p>
              {keyError && (
                <p className="mt-1.5 text-2xs text-critical" role="alert">
                  {keyError}
                </p>
              )}
            </div>
          )}
        </div>

        {busy && <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-faint" />}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-line px-3 py-2">
        {/*
          Installation Assistant entry point (v1.2.3 Appendix Part P).

          A plain link, not a Button-wrapped one — `main.ts`'s
          `setWindowOpenHandler` already routes any `target="_blank"` link to
          `shell.openExternal`, exactly as `About`'s GitHub link does, so this
          needs no new IPC channel and no new attack surface. Detection then
          picks the install up on its own via `useDiscoveryWatch` on whichever
          step this card is rendered from — no "I've installed it, now what"
          dead end.
        */}
        {!installed && manifest.documentationUrl && (
          <a
            href={manifest.documentationUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 select-none items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-150 ease-quiet hover:bg-elevated"
          >
            Install
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={onTest} disabled={busy}>
          Test
        </Button>
        {councilCapable && !active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMakeActive}
            disabled={busy || !installed}
            className="text-accent hover:bg-accent/10"
          >
            Make active
          </Button>
        )}
        {(auth.state === 'authenticated' || auth.state === 'invalid') && (
          <Button variant="danger" size="sm" onClick={onDisconnect} disabled={busy}>
            Disconnect
          </Button>
        )}
        {variant === 'full' && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={`What ${manifest.displayName} can do`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-2xs text-faint transition-colors hover:text-muted"
          >
            What it can do
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-200 ease-quiet',
                expanded && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      {expanded && variant === 'full' && (
        <div className="border-t border-line px-4 py-3 animate-fade-up">
          <CapabilityGrid provider={provider} />
          <p className="mt-3 text-2xs leading-relaxed text-faint">
            {manifest.verification === 'verified-live'
              ? 'These have been tested against a running copy of this AI.'
              : manifest.verification === 'vendor-documented'
                ? 'Taken from this AI’s own documentation and not yet tested here. Treat anything surprising as unconfirmed.'
                : 'Not verified.'}
          </p>
          {/*
            v1.2.3 Appendix — disclosure for the one thing Hosted engines
            receive that Native engines never do. Mirrors `directiveFor` being
            exported so the runtime-mode UI can show a founder-selected mode
            verbatim: a context the founder cannot see would be a hidden
            prompt, exactly what that invariant exists to forbid.
          */}
          {manifest.executionMode === 'hosted' && (
            <p className="mt-2 rounded-lg border border-line bg-elevated px-3 py-2 text-2xs leading-relaxed text-faint">
              This connection is told, in a fixed message it cannot change, that it has no
              access to your files or terminal and cannot host your Executive Council. It can
              still help you install an AI that can — see{' '}
              <span className="font-mono">shared/runtime/injection.ts</span> for the exact text.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Three-state capability list. `unknown` is drawn distinctly from `unsupported`. */
export function CapabilityGrid({ provider }: { provider: ProviderSnapshot }) {
  const { capabilities } = provider.manifest;

  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {CAPABILITY_ORDER.map((capability) => {
        const state = stateOf(capabilities, capability as Capability);
        const reason = capabilities.reasons?.[capability as Capability];
        return (
          <li key={capability} className="flex items-start gap-2">
            {state === 'supported' ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" strokeWidth={2} />
            ) : state === 'unsupported' ? (
              <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.75} />
            ) : (
              // Distinct glyph, distinct meaning: nobody has established this.
              <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caution" strokeWidth={2} />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  'text-[13px]',
                  state === 'supported' ? 'text-muted' : 'text-faint'
                )}
              >
                {CAPABILITY_LABELS[capability as Capability]}
              </span>
              {state === 'unknown' && (
                <span className="ml-1.5 text-2xs text-caution">unconfirmed</span>
              )}
              {reason && state !== 'supported' && (
                <span className="mt-0.5 block text-2xs leading-relaxed text-faint">{reason}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Small standing indicator for the header and the sidebar. */
export function BrainBadge({ provider }: { provider: ProviderSnapshot | null }) {
  if (!provider) {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-caution">
        <span className="h-1.5 w-1.5 rounded-full bg-caution" />
        No AI selected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-faint">
      <ShieldCheck className="h-3 w-3 text-positive" strokeWidth={2} />
      {provider.manifest.displayName}
    </span>
  );
}
