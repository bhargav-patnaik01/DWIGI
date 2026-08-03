'use client';

import { useState } from 'react';
import { Github, Shield } from 'lucide-react';
import type { ExecutiveLens } from '@shared/repo';
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
export function About({
  appVersion,
  repositoryUrl,
}: {
  appVersion: string | null;
  repositoryUrl: string | null;
}) {
  return (
    <div className="mt-12 border-t border-line pt-6">
      <p className="text-[13px] font-medium text-ink">Thank you for using - Bhargav Patnaik</p>

      <div className="mt-3 text-[13px] leading-relaxed text-faint">
        <div>D.W.I.G.I — Don&rsquo;t Worry I Got It</div>
        {appVersion && <div>Version {appVersion}</div>}
      </div>

      {repositoryUrl && (
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3',
            'text-[13px] font-medium text-ink transition-colors hover:bg-elevated'
          )}
        >
          <Github className="h-3.5 w-3.5" strokeWidth={1.75} />
          GitHub repository
        </a>
      )}
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
