'use client';

import { useEffect } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { ProviderCard } from '@/components/runtime/ProviderCard';
import { useRuntime, useActiveBrain, useDiscoveryWatch } from '@/lib/store/runtime';

/**
 * AI Control Center.
 *
 * ---------------------------------------------------------------------------
 * NOTHING ON THIS SCREEN SWITCHES ITSELF
 * ---------------------------------------------------------------------------
 * No automatic failover, no "we picked a healthy one for you", no silent
 * reconnect. Every state change on this screen is a button the founder pressed.
 *
 * That is ADR-013 §E's rule, and the reason is that the Active Brain decides
 * which model reasons about irreversible business decisions. An application that
 * quietly moved that to a different AI because the first one was slow would be
 * changing the thing doing the thinking without saying so.
 */
export default function BrainsPage() {
  const {
    providers,
    busyProviderId,
    scanning,
    error,
    loaded,
    refresh,
    detect,
    checkHealth,
    setActive,
    disconnect,
    submitApiKey,
    clearError,
  } = useRuntime();

  const active = useActiveBrain();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * Continuous discovery (v1.2.3 Appendix Part S), scoped to this screen only.
   *
   * This updates `providers` — presence, health, version — the same field
   * `refresh()` already updates on mount. It does not touch `activeProviderId`
   * or connection state, so the "nothing switches itself" rule above is
   * unchanged: a founder finishing an install elsewhere sees it appear here
   * without a click, and Scan below remains for an immediate, explicit sweep.
   */
  useDiscoveryWatch();

  return (
    <>
      <ScreenHeader
        title="AI"
        subtitle={active ? `Active — ${active.manifest.displayName}` : 'No AI selected'}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void detect()} disabled={scanning}>
            <RefreshCw
              className={scanning ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
              strokeWidth={2}
            />
            Scan
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-reading px-5 py-6">
          {!loaded && providers.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="Looking for AI"
              description="Checking which AI tools are installed on this computer."
            />
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-muted">
                One AI powers your executive council at a time. Others can stay connected
                and be switched to whenever you want — nothing you have recorded is tied
                to any of them.
              </p>

              {error && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-critical/30 bg-critical/5 px-3.5 py-3">
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">{error}</p>
                  <button
                    type="button"
                    onClick={clearError}
                    className="shrink-0 text-2xs text-faint hover:text-muted"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="mt-5 space-y-3">
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.manifest.id}
                    provider={provider}
                    busy={busyProviderId === provider.manifest.id}
                    onTest={() => void checkHealth(provider.manifest.id)}
                    onMakeActive={() => void setActive(provider.manifest.id)}
                    onDisconnect={() => void disconnect(provider.manifest.id)}
                    onSubmitKey={(secret) => submitApiKey(provider.manifest.id, secret)}
                  />
                ))}
              </div>

              <p className="mt-6 text-2xs leading-relaxed text-faint">
                D.W.I.G.I never sees or stores a sign-in for the AI tools that manage their
                own. Where a key is needed it is held in this computer&rsquo;s secure
                keychain and is never shown again, exported, or sent anywhere but to that
                provider.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
