'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  FolderPlus,
  FolderOpen,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { AppMark } from '@/components/shared/AppMark';
import { Button } from '@/components/ui/button';
import { ProviderCard } from '@/components/runtime/ProviderCard';
import { useRuntime, useDiscoveryWatch } from '@/lib/store/runtime';
import { useWorkspace } from '@/lib/store/workspace';
import { useUi } from '@/lib/store/ui';
import { useCouncilConfig, MIN_ENABLED_LENSES } from '@/lib/executives';
import { applyLensToggle } from '@shared/runtime-modes';
import { cn } from '@/lib/utils';

/**
 * First run — everything between launching the application and having a board.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FLOW OWNS, AND WHERE IT STOPS
 * ---------------------------------------------------------------------------
 * It sets up the *machinery*: a workspace on disk, an AI connected, one chosen to
 * think with, and which executives sit on the board. It stops there and hands over
 * to the engine's own onboarding conversation, which is where the founder is asked
 * about their business.
 *
 * That boundary is deliberate and it is the same one `Welcome` held before: there
 * are no business questions in this application. Every word a founder reads about
 * their own company comes from `core/onboarding/memory_protocol.md`, so a second
 * set of questions here would drift from the one the advisor actually uses.
 *
 * ---------------------------------------------------------------------------
 * NO DEVELOPER VOCABULARY REACHES THIS SCREEN
 * ---------------------------------------------------------------------------
 * Not "repository", not "CLI", not "provider", not "runtime". A founder meets three
 * nouns — Workspace, AI, Executive Council — and those three carry the whole model.
 * Folder paths appear only where the founder just chose one and needs to confirm it
 * is the right one.
 */

type Step = 'welcome' | 'workspace' | 'discovery' | 'connect' | 'brain' | 'council';

const STEPS: { id: Step; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'discovery', label: 'Find AI' },
  { id: 'connect', label: 'Connect' },
  { id: 'brain', label: 'Choose' },
  { id: 'council', label: 'Council' },
];

interface FirstRunProps {
  /** Called when setup is finished and the advisor should be handed control. */
  onLaunch(): void;
  /** True while the first conversation is being created. */
  launching: boolean;
}

export function FirstRun({ onLaunch, launching }: FirstRunProps) {
  const workspacePath = useUi((s) => s.workspacePath);
  const activeProviderId = useRuntime((s) => s.activeProviderId);

  /*
   * Resume where setup stopped, rather than restarting.
   *
   * Someone who chose a folder, quit, and came back should not be asked to choose
   * it again — and a founder who only ever lost their AI should not be walked
   * through the introduction a second time. Computed once, on mount, so the flow
   * does not jump forward under the founder as they complete a step.
   */
  const [step, setStep] = useState<Step>(() => {
    if (!workspacePath) return 'welcome';
    if (!activeProviderId) return 'discovery';
    return 'council';
  });

  const providers = useRuntime((s) => s.providers);
  const scanning = useRuntime((s) => s.scanning);
  const detect = useRuntime((s) => s.detect);

  // The scan starts when the founder reaches the step, not on mount. Probing the
  // machine before they have asked for anything would be the application doing
  // work nobody requested, on a screen that has not explained itself yet.
  useEffect(() => {
    if (step === 'discovery') void detect();
  }, [step, detect]);

  const index = STEPS.findIndex((entry) => entry.id === step);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="drag-region h-12 shrink-0" />

      {step !== 'welcome' && (
        <StepRail current={index} />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[34rem] px-6 pb-12 pt-2">
          {step === 'welcome' && <WelcomeStep onNext={() => setStep('workspace')} />}

          {step === 'workspace' && (
            <WorkspaceStep
              onNext={() => setStep('discovery')}
              currentPath={workspacePath}
            />
          )}

          {step === 'discovery' && (
            <DiscoveryStep
              scanning={scanning}
              onRescan={() => void detect()}
              onNext={() => setStep('connect')}
              onBack={() => setStep('workspace')}
            />
          )}

          {step === 'connect' && (
            <ConnectStep onNext={() => setStep('brain')} onBack={() => setStep('discovery')} />
          )}

          {step === 'brain' && (
            <BrainStep
              onNext={() => setStep('council')}
              onBack={() => setStep('connect')}
              activeProviderId={activeProviderId}
              councilCapableCount={providers.filter((p) => p.councilCapable).length}
            />
          )}

          {step === 'council' && (
            <CouncilStep
              onBack={() => setStep('brain')}
              onLaunch={onLaunch}
              launching={launching}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress rail                                                              */
/* -------------------------------------------------------------------------- */

function StepRail({ current }: { current: number }) {
  return (
    <div className="shrink-0 px-6 pb-4 pt-1">
      {/*
        A progressbar rather than decorative divs. A screen reader announcing
        "step 3 of 5, Connect" is the difference between a navigable setup flow
        and five unlabelled bars.
      */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={current + 1}
        aria-valuetext={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]?.label ?? ''}`}
        className="mx-auto flex w-full max-w-[34rem] items-center gap-1.5"
      >
        {STEPS.map((entry, i) => (
          <div key={entry.id} className="flex flex-1 flex-col gap-1.5">
            <div
              className={cn(
                'h-0.5 rounded-full transition-colors duration-300 ease-quiet',
                i < current ? 'bg-accent/60' : i === current ? 'bg-accent' : 'bg-line'
              )}
            />
            <span
              className={cn(
                'text-2xs transition-colors duration-300',
                i === current ? 'text-muted' : 'text-faint'
              )}
            >
              {entry.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{blurb}</p>
    </div>
  );
}

function Footer({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  busy,
  hint,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  hint?: string;
}) {
  return (
    <div className="mt-8 flex items-center gap-2 border-t border-line pt-5">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back
        </Button>
      )}
      <div className="ml-auto flex items-center gap-3">
        {hint && <span className="text-2xs text-faint">{hint}</span>}
        {onNext && (
          <Button variant="primary" size="sm" onClick={onNext} disabled={nextDisabled || busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <>
                {nextLabel}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 1 — Welcome                                                                */
/* -------------------------------------------------------------------------- */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="pt-6">
      <div className="animate-fade-up">
        <AppMark size={80} />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-ink">
          D.W.I.G.I
        </h1>
        <p className="mt-2 text-[14px] text-muted">Don&rsquo;t Worry I Got It</p>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          A Chief of Staff for founders who decide alone.
        </p>
      </div>

      <div className="animate-fade-up mt-8 space-y-3" style={{ animationDelay: '140ms' }}>
        <Concept
          title="Your workspace"
          body="A folder on this computer that holds everything about your business — what the board knows, and every decision it has recorded for you. It stays on your machine."
        />
        <Concept
          title="Your AI"
          body="The thinking engine behind the board. You choose which one to use, and you can change it later without losing anything."
        />
        <Concept
          title="Your executive council"
          body="Strategy, capital, execution, revenue, product, risk. They deliberate on your decision and you receive one recommendation — not a panel of opinions."
        />
      </div>

      <div className="animate-fade-up mt-9" style={{ animationDelay: '240ms' }}>
        <Button variant="primary" onClick={onNext} className="group">
          Set up D.W.I.G.I
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 ease-quiet group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </Button>
        <p className="mt-3 text-2xs text-faint">Takes about two minutes.</p>
      </div>
    </div>
  );
}

function Concept({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-[13px] font-medium text-ink">{title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2 — Workspace                                                              */
/* -------------------------------------------------------------------------- */

function WorkspaceStep({
  onNext,
  currentPath,
}: {
  onNext: () => void;
  currentPath: string | null;
}) {
  const { choose, validate, create, open, repair, validation, notice, busy, error, reset } =
    useWorkspace();
  const [candidate, setCandidate] = useState<string | null>(currentPath);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'idle' | 'create' | 'open'>('idle');

  const pick = useCallback(
    async (intent: 'create' | 'open') => {
      reset();
      setMode(intent);
      const chosen = await choose();
      if (!chosen) {
        setMode('idle');
        return;
      }
      setCandidate(chosen);
      // Default the name to the folder's own, so most founders never type one.
      const leaf = chosen.split(/[\\/]/).filter(Boolean).pop() ?? 'My workspace';
      setName(leaf);
      await validate(chosen);
    },
    [choose, reset, validate]
  );

  const ready = currentPath !== null && validation?.ok === true;

  return (
    <div>
      <StepHeading
        title="Choose a workspace"
        blurb="Your workspace is a folder on this computer. Everything the board learns about your business lives there, and nothing is uploaded anywhere."
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <ChoiceTile
          icon={FolderPlus}
          title="Create a workspace"
          body="Pick an empty folder. D.W.I.G.I sets everything up for you."
          onClick={() => void pick('create')}
          selected={mode === 'create'}
        />
        <ChoiceTile
          icon={FolderOpen}
          title="Open a workspace"
          body="Already have one? Point D.W.I.G.I at it."
          onClick={() => void pick('open')}
          selected={mode === 'open'}
        />
      </div>

      {candidate && (
        <div className="mt-5 animate-fade-up">
          {/* The one place a path is shown: the founder just chose it and needs to
              confirm it is the right folder. */}
          <div className="rounded-lg border border-line bg-elevated px-3 py-2">
            <div className="text-2xs text-faint">Selected folder</div>
            <div className="mt-0.5 truncate font-mono text-[13px] text-muted">{candidate}</div>
          </div>

          {busy && (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Understanding your workspace…
            </p>
          )}

          {validation && !validation.ok && (
            <div className="mt-3 rounded-xl border border-caution/30 bg-caution/5 px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-caution"
                  strokeWidth={1.75}
                />
                <div className="min-w-0">
                  <p className="text-[13px] leading-relaxed text-muted">{validation.summary}</p>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {validation.offerCreate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (await create(candidate, name)) onNext();
                        }}
                        disabled={busy}
                      >
                        Set up a workspace here
                      </Button>
                    )}
                    {validation.offerRepair && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void repair(candidate)}
                        disabled={busy}
                      >
                        Repair it
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => void pick(mode === 'create' ? 'create' : 'open')}>
                      Choose a different folder
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {validation?.ok && currentPath !== candidate && (
            <div className="mt-3">
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (await open(candidate)) onNext();
                }}
                disabled={busy}
              >
                Use this workspace
              </Button>
            </div>
          )}

          {notice && (
            <p className="mt-3 text-[13px] leading-relaxed text-faint">{notice}</p>
          )}
          {error && <p className="mt-3 text-[13px] text-critical">{error}</p>}
        </div>
      )}

      <Footer
        onNext={ready ? onNext : undefined}
        nextDisabled={!ready}
        hint={ready ? undefined : 'Choose a folder to continue'}
      />
    </div>
  );
}

function ChoiceTile({
  icon: Icon,
  title,
  body,
  onClick,
  selected,
}: {
  icon: typeof FolderPlus;
  title: string;
  body: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-surface p-4 text-left transition-colors duration-150 ease-quiet',
        'hover:bg-elevated',
        selected ? 'border-accent/50' : 'border-line'
      )}
    >
      <Icon className="h-[18px] w-[18px] text-faint" strokeWidth={1.75} />
      <div className="mt-2.5 text-[13px] font-medium text-ink">{title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* 3 — Discovery                                                              */
/* -------------------------------------------------------------------------- */

function DiscoveryStep({
  scanning,
  onRescan,
  onNext,
  onBack,
}: {
  scanning: boolean;
  onRescan: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const providers = useRuntime((s) => s.providers);
  const found = providers.filter((provider) => provider.health.state !== 'absent' && provider.health.state !== 'unknown');

  // Continuous discovery (v1.2.3 Appendix Part S): a founder who installs an
  // AI while this step is on screen sees it appear on its own. Scoped to this
  // component's lifetime — see `useDiscoveryWatch`.
  useDiscoveryWatch();

  return (
    <div>
      <StepHeading
        title="Looking for AI on this computer"
        blurb="D.W.I.G.I checks for the AI tools you already have installed. Nothing is contacted over the internet and nothing is signed in to yet."
      />

      <div className="mt-6 space-y-2">
        {providers.map((provider, i) => {
          const state = provider.health.state;
          const done = !scanning;
          return (
            <div
              key={provider.manifest.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {!done ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-faint" />
              ) : state === 'absent' || state === 'unknown' ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
              ) : (
                <Check className="h-3.5 w-3.5 shrink-0 text-positive" strokeWidth={2} />
              )}
              <span className="text-[13px] text-ink">{provider.manifest.displayName}</span>
              <span className="ml-auto text-2xs text-faint">
                {!done
                  ? 'Checking…'
                  : state === 'absent'
                    ? 'Not installed'
                    : state === 'unknown'
                      ? 'Not checked'
                      : state === 'degraded'
                        ? 'Found, needs attention'
                        : 'Found'}
              </span>
            </div>
          );
        })}
      </div>

      {!scanning && found.length === 0 && (
        <div className="mt-5 rounded-xl border border-caution/30 bg-caution/5 px-3.5 py-3">
          <p className="text-[13px] leading-relaxed text-muted">
            No AI was found on this computer yet. You will need at least one to use
            D.W.I.G.I. Install one, then scan again — the next screen has links.
          </p>
        </div>
      )}

      <Footer
        onBack={onBack}
        onNext={onNext}
        busy={scanning}
        hint={
          scanning
            ? undefined
            : `${found.length} found`
        }
      />

      {!scanning && (
        <button
          type="button"
          onClick={onRescan}
          className="mt-3 inline-flex items-center gap-1.5 text-2xs text-faint transition-colors hover:text-muted"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2} />
          Scan again
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4 — Connect                                                                */
/* -------------------------------------------------------------------------- */

function ConnectStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { providers, busyProviderId, checkHealth, setActive, disconnect, submitApiKey, error } =
    useRuntime();

  // A founder who opens an install page from this step and comes back should
  // see it detected without pressing anything (v1.2.3 Appendix Part P/S).
  useDiscoveryWatch();

  // Installed first: a founder should not scroll past four things they do not have
  // to reach the one they do.
  const ordered = useMemo(
    () =>
      [...providers].sort((a, b) => {
        const rank = (state: string) => (state === 'absent' || state === 'unknown' ? 1 : 0);
        return rank(a.health.state) - rank(b.health.state);
      }),
    [providers]
  );

  return (
    <div>
      <StepHeading
        title="Connect an AI"
        blurb="Connect at least one. Those marked “conversation only” can chat, but cannot run your executive council — the card explains why."
      />

      {error && (
        <p className="mt-4 rounded-lg border border-critical/30 bg-critical/5 px-3.5 py-2.5 text-[13px] text-muted">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {ordered.map((provider) => (
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

      <Footer onBack={onBack} onNext={onNext} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5 — Active Brain                                                           */
/* -------------------------------------------------------------------------- */

function BrainStep({
  onNext,
  onBack,
  activeProviderId,
  councilCapableCount,
}: {
  onNext: () => void;
  onBack: () => void;
  activeProviderId: string | null;
  councilCapableCount: number;
}) {
  const { providers, busyProviderId, setActive, error } = useRuntime();
  const eligible = providers.filter((provider) => provider.councilCapable);

  return (
    <div>
      <StepHeading
        title="Choose the AI that thinks for your board"
        blurb="One AI powers your executive council. You can change it at any time from the AI screen, and nothing you have recorded is affected."
      />

      {error && (
        <p className="mt-4 rounded-lg border border-critical/30 bg-critical/5 px-3.5 py-2.5 text-[13px] text-muted">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-2" role="radiogroup" aria-label="Choose the AI that powers your council">
        {eligible.map((provider) => {
          const selected = provider.manifest.id === activeProviderId;
          const installed = provider.health.state !== 'absent';
          return (
            <button
              key={provider.manifest.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!installed || busyProviderId !== null}
              onClick={() => void setActive(provider.manifest.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left',
                'transition-colors duration-150 ease-quiet',
                'disabled:cursor-not-allowed disabled:opacity-50',
                selected ? 'border-accent/50 bg-accent/5' : 'border-line hover:bg-elevated'
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-accent bg-accent' : 'border-line'
                )}
              >
                {selected && <Check className="h-2.5 w-2.5 text-accent-ink" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">
                  {provider.manifest.displayName}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {installed ? provider.manifest.summary : 'Not installed on this computer.'}
                </span>
              </span>
              {busyProviderId === provider.manifest.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />
              )}
            </button>
          );
        })}
      </div>

      {councilCapableCount === 0 && (
        <p className="mt-4 rounded-xl border border-caution/30 bg-caution/5 px-3.5 py-3 text-[13px] leading-relaxed text-muted">
          None of the AI options on this computer can run an executive council yet.
          Claude Code and Gemini CLI can — install either one and scan again.
        </p>
      )}

      <Footer
        onBack={onBack}
        onNext={activeProviderId ? onNext : undefined}
        nextDisabled={!activeProviderId}
        hint={activeProviderId ? undefined : 'Choose one to continue'}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6 — Council                                                                */
/* -------------------------------------------------------------------------- */

function CouncilStep({
  onBack,
  onLaunch,
  launching,
}: {
  onBack: () => void;
  onLaunch: () => void;
  launching: boolean;
}) {
  const config = useCouncilConfig();
  const setEnabledLenses = useUi((s) => s.setEnabledLenses);
  const [refusal, setRefusal] = useState<string | null>(null);

  const toggle = (lensId: string, next: boolean) => {
    const available = config.constructive.map((lens) => lens.id);
    const outcome = applyLensToggle([...config.enabled], lensId, next, available);
    if (!outcome.ok) {
      setRefusal(outcome.reason);
      return;
    }
    setRefusal(null);
    setEnabledLenses(outcome.enabled);
  };

  /*
   * The one moment of arrival in the whole flow.
   *
   * It is shown *while the handoff is actually happening* rather than as a
   * congratulatory interstitial on a timer. A celebration that fires before the
   * work completes is a lie the founder finds out about a second later; this one
   * is true for exactly as long as it is on screen.
   */
  if (launching) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 animate-fade-up"
          aria-hidden="true"
        >
          <Check className="h-6 w-6 text-accent" strokeWidth={2.5} />
        </div>
        <h2
          className="mt-5 text-[19px] font-semibold tracking-tight text-ink animate-fade-up"
          style={{ animationDelay: '80ms' }}
        >
          Your board is ready
        </h2>
        <p
          className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted animate-fade-up"
          style={{ animationDelay: '160ms' }}
        >
          Your Chief of Staff is about to introduce itself and ask about your business.
          Answer in plain sentences — there is no form.
        </p>
        <p
          className="mt-6 flex items-center gap-2 text-2xs text-faint animate-fade-up"
          style={{ animationDelay: '260ms' }}
          role="status"
        >
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
          Preparing your Executive Council…
        </p>
      </div>
    );
  }

  return (
    <div>
      <StepHeading
        title="Your executive council"
        blurb="These are the perspectives your decisions are examined through. Most founders leave this as it is — you can change it later."
      />

      {config.unavailable ? (
        <p className="mt-5 rounded-xl border border-caution/30 bg-caution/5 px-3.5 py-3 text-[13px] leading-relaxed text-muted">
          The executive definitions could not be read from this workspace: {config.unavailable}
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-1.5">
            {config.constructive.map((lens) => {
              const on = config.isEnabled(lens.id);
              return (
                <label
                  key={lens.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 transition-colors hover:bg-elevated"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) => toggle(lens.id, event.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--accent))]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{lens.name}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                      {lens.role}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {/*
            Structural lenses are shown, never offered as switches. The interface
            says why rather than presenting a control the engine would ignore.
          */}
          {config.structural.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-elevated px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-faint" strokeWidth={1.75} />
                <span className="text-[13px] font-medium text-muted">Always on the board</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-faint">
                {config.structural.map((lens) => lens.name).join(' and ')} attack every
                recommendation before you see it. They cannot be switched off — a
                recommendation nothing argued against is untested.
              </p>
            </div>
          )}

          {refusal && <p className="mt-3 text-[13px] text-caution">{refusal}</p>}
          <p className="mt-3 text-2xs text-faint">
            {config.enabled.size} of {config.constructive.length} selected. At least{' '}
            {MIN_ENABLED_LENSES} are needed for a deliberation.
          </p>
        </>
      )}

      <Footer
        onBack={onBack}
        onNext={onLaunch}
        nextLabel="Start"
        busy={launching}
      />
    </div>
  );
}
