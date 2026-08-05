'use client';

import { useState } from 'react';
import { ChevronRight, Github, Shield } from 'lucide-react';
import type { ExecutiveLens } from '@shared/repo';
import type { HostInfo } from '@shared/host';
import { AppMark } from '@/components/shared/AppMark';
import { Unavailable } from '@/components/repo/Unavailable';
import { Toggle } from '@/components/ui/toggle';
import { applyLensToggle, FLOOR_MESSAGE, MIN_ENABLED_LENSES } from '@shared/runtime-modes';
import { useCouncilConfig } from '@/lib/executives';
import { useUi } from '@/lib/store/ui';
import { cn } from '@/lib/utils';

/**
 * A lens the manifest says cannot be fully suppressed.
 *
 * ---------------------------------------------------------------------------
 * READ FROM THE FILE, NOT HARDCODED
 * ---------------------------------------------------------------------------
 * `core/executive_manifest.md` writes standing floors into each lens's
 * *Suppressed when* text — the CFO's is "never suppressed while runway is under
 * six months". Rather than encoding "CFO has a floor" here, which would be a
 * second copy of a rule that lives in the repository, this matches the file's
 * own phrasing.
 *
 * The source moved from the persona file to the manifest in ADR-012, and the
 * matched text came with it unchanged. Reading the old location would now find
 * nothing and silently stop warning — which is why a test asserts this caution
 * still fires for the live board rather than trusting the field to exist.
 *
 * If a floor is added to another lens, or removed from this one, the interface
 * follows without a code change. If the phrasing changes, the caution disappears
 * — which is the honest failure direction: the interface stops claiming a rule it
 * can no longer see rather than asserting one from memory.
 */
const STANDING_FLOOR = /never suppressed/i;

/** Strip the schema's emphasis so file prose reads cleanly as UI text. */
function undecorate(text: string): string {
  return text.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

/**
 * Agent Management.
 *
 * ---------------------------------------------------------------------------
 * THESE TOGGLES ARE NOT DECORATIVE, AND THE LOCKED ONES ARE NOT DECEPTIVE
 * ---------------------------------------------------------------------------
 * An enabled set that differs from the default is transmitted on every Council
 * turn as a `/council` directive, which narrows the routing gate's candidate pool
 * inside the engine. That is the whole mechanism — no persona is rewritten, no
 * canonical file is edited, and nothing is deleted.
 *
 * The challenge lenses carry no toggle because the matrix declares them
 * non-suppressible at full deliberation depth. A switch that appeared to disable
 * them would be a lie the founder could not detect, so they are shown as
 * permanent with the reason stated.
 *
 * Configuration is stored in this application's own preferences. Nothing is
 * written to `core/`, `journal/`, or any persona definition.
 */
export function AgentManagement() {
  const { constructive, structural, enabled, unavailable, manifestError } = useCouncilConfig();
  const setEnabledLenses = useUi((s) => s.setEnabledLenses);
  const [refused, setRefused] = useState<string | null>(null);

  const toggle = (lens: ExecutiveLens, next: boolean) => {
    // The floor lives in `shared/runtime-modes.ts`, not here. This screen renders
    // the refusal; it does not decide it, so a second surface offering these
    // toggles could not enforce a different limit.
    const outcome = applyLensToggle(
      [...enabled],
      lens.id,
      next,
      constructive.map((entry) => entry.id)
    );

    if (!outcome.ok) {
      setRefused(lens.id);
      return;
    }

    setRefused(null);
    // Persisted as an explicit list even when it happens to be complete. The
    // directive layer decides whether a complete list means "send nothing", so
    // this store does not have to model the difference.
    setEnabledLenses(outcome.enabled);
  };

  if (unavailable) {
    return (
      <Section
        title="Agent Management"
        note="Which executives the Council may engage."
      >
        <Unavailable label="Executive definitions" reason={unavailable} />
      </Section>
    );
  }

  /*
   * No trustworthy participation data means no configuration surface.
   *
   * Without the manifest every lens reads as constructive, so this screen would
   * offer toggles for the two challenge lenses — switches the engine ignores.
   * Showing a switch that does nothing is worse than showing none, because the
   * founder cannot tell the difference from the outside.
   */
  if (manifestError) {
    return (
      <Section title="Agent Management" note="Which executives the Council may engage.">
        <Unavailable label="Executive routing manifest" reason={manifestError} />
      </Section>
    );
  }

  return (
    <Section
      title="Agent Management"
      note={`Which executives the Council may engage. ${enabled.size} of ${constructive.length} enabled. This affects Council Chat only — a single-agent chat engages the executive you picked regardless.`}
    >
      <div className="divide-y divide-line">
        {constructive.map((lens) => {
          const on = enabled.has(lens.id);
          const suppressed = lens.routing?.suppressed ?? '';
          const floor = STANDING_FLOOR.test(suppressed);
          const blocked = on && enabled.size <= MIN_ENABLED_LENSES;

          return (
            <div key={lens.id} className="flex items-start justify-between gap-5 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-medium text-ink">{lens.name}</span>
                  <span className="text-2xs text-faint">{lens.role}</span>
                </div>

                {floor && (
                  <p className="mt-1 text-2xs leading-relaxed text-caution">
                    Has a standing floor and may be engaged even when disabled —{' '}
                    {undecorate(suppressed)}
                  </p>
                )}

                {refused === lens.id && (
                  <p className="mt-1 text-2xs leading-relaxed text-caution">{FLOOR_MESSAGE}</p>
                )}
              </div>

              <Toggle
                checked={on}
                onChange={(next) => toggle(lens, next)}
                label={`${lens.name} enabled for Council deliberation`}
                title={blocked ? FLOOR_MESSAGE : undefined}
              />
            </div>
          );
        })}
      </div>

      {structural.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-3.5">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} />
            <span className="text-[13px] font-medium text-muted">
              Always engaged, not configurable
            </span>
          </div>
          <p className="mt-1.5 text-2xs leading-relaxed text-faint">
            {structural.map((lens) => lens.name).join(' and ')} attack the finished
            recommendation rather than helping build it. The routing manifest declares them
            non-suppressible at full deliberation depth, so this screen does not offer a
            switch that the engine would ignore.
          </p>
        </div>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-faint">
        Stored in this application&rsquo;s preferences. No persona definition is edited and
        nothing is written into the repository.
      </p>
    </Section>
  );
}

/**
 * About.
 *
 * Version comes from the packaged application&rsquo;s own metadata, and the
 * repository link from its `package.json`. Neither is written here, and when the
 * host cannot supply one the line is omitted rather than filled with a guess.
 */
export function About({ host, repositoryUrl }: { host: HostInfo | null; repositoryUrl: string | null }) {
  const [showRuntime, setShowRuntime] = useState(false);

  /**
   * Operating system in the words people use for it.
   *
   * `win32` is a build target, not a product a founder owns. It is also
   * misleading — it reads as 32-bit on a 64-bit machine. The raw value is still
   * exactly what Diagnostics reports, because a bug report needs the token.
   */
  const osName =
    host?.platform === 'win32'
      ? 'Windows'
      : host?.platform === 'darwin'
        ? 'macOS'
        : host?.platform === 'linux'
          ? 'Linux'
          : (host?.platform ?? 'Unknown');

  return (
    <div className="mt-12 border-t border-line pt-6">
      {/* Primary identity. The product, its version, what it is, who made it. */}
      <div className="flex items-start gap-3">
        <AppMark size={36} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight text-ink">D.W.I.G.I</div>
          <div className="mt-0.5 text-[13px] text-muted">Don&rsquo;t Worry I Got It</div>
        </div>
      </div>

      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
        An AI executive council for founders who decide alone.
      </p>

      <dl className="mt-4 space-y-1.5">
        {/* The application's version, and the only one shown by default. */}
        <AboutRow label="Version" value={host?.appVersion ?? '—'} emphasis />
        <AboutRow label="Created by" value="Bhargav Patnaik" />
      </dl>

      {/* Secondary: the machine, not the toolchain. */}
      <dl className="mt-4 space-y-1.5 border-t border-line pt-4">
        <AboutRow label="Operating system" value={osName} />
        <AboutRow label="Architecture" value={host?.arch ?? '—'} />
      </dl>

      {/*
        Advanced, and collapsed.

        Electron, Chromium, and Node are real and a maintainer sometimes needs
        them — but they describe how the application was built, not what it is.
        Presenting them first told a founder they had opened a developer tool.
        Diagnostics is untouched and still lists everything without a disclosure.
      */}
      <div className="mt-4 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setShowRuntime((value) => !value)}
          aria-expanded={showRuntime}
          className="inline-flex items-center gap-1.5 rounded-lg text-[13px] text-faint transition-colors hover:text-muted"
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200 ease-quiet',
              showRuntime && 'rotate-90'
            )}
            strokeWidth={2}
          />
          Runtime information
        </button>

        {showRuntime && (
          <dl className="mt-2.5 space-y-1.5 animate-fade-up">
            <AboutRow label="Electron" value={host?.electronVersion ?? '—'} />
            <AboutRow label="Chromium" value={host?.chromeVersion ?? '—'} />
            <AboutRow label="Node" value={host?.nodeVersion ?? '—'} />
          </dl>
        )}
      </div>

      {repositoryUrl && (
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'mt-5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3',
            'text-[13px] font-medium text-ink transition-colors hover:bg-elevated'
          )}
        >
          <Github className="h-3.5 w-3.5" strokeWidth={1.75} />
          Project on GitHub
        </a>
      )}
    </div>
  );
}

/** One label/value pair. `emphasis` marks the application's own version. */
function AboutRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-4">
      <dt className="w-36 shrink-0 text-[13px] text-faint">{label}</dt>
      <dd
        className={cn(
          'min-w-0 flex-1 text-[13px]',
          emphasis ? 'tabular font-medium text-ink' : 'text-muted'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    // No top border: the preceding settings row already draws one, and two rules
    // a gap apart read as a mistake rather than as separation.
    <section className="mt-8">
      <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{note}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}
