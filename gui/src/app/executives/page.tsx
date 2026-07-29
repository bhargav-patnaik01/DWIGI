'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare, Shield, Users } from 'lucide-react';
import type { ExecutiveLens } from '@shared/repo';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Unavailable } from '@/components/repo/Unavailable';
import { Button } from '@/components/ui/button';
import { useCouncilConfig } from '@/lib/executives';
import { useChat } from '@/lib/store/chat';
import { useConversations } from '@/lib/store/conversations';
import { useUi } from '@/lib/store/ui';
import { cn } from '@/lib/utils';

/**
 * Executive Board — who deliberates, and in what configuration.
 *
 * ---------------------------------------------------------------------------
 * THE HARD RULE THIS SCREEN OBEYS
 * ---------------------------------------------------------------------------
 * Every word of every card comes out of `core/executive_matrix.md`. There is no
 * roster in this file, no role blurb, no invented mandate. A lens the matrix does
 * not define cannot appear here, and if the matrix is unreadable the screen says
 * so rather than falling back to something plausible.
 *
 * ---------------------------------------------------------------------------
 * AND THE ONE IT REFUSES TO BREAK
 * ---------------------------------------------------------------------------
 * No live activity. The runtime reports tool use — reads, writes, searches — and
 * nothing whatsoever about which lens is participating in a deliberation. So this
 * screen shows *configured* state, which it knows, and never "Active", "Consulted",
 * or "CEO is thinking", which it would be inventing.
 *
 * Deriving participation from the advisor's prose was considered and rejected:
 * routing is a gate the founder cannot see, suppression is structural and silent
 * by design, and guessing at it would put a fabricated audit trail in front of
 * someone making an irreversible decision. `/stress-test` is how the real routing
 * gets audited, and it comes from the engine.
 */
export default function ExecutivesPage() {
  const router = useRouter();
  const workspacePath = useUi((s) => s.workspacePath);
  const startNew = useConversations((s) => s.startNew);
  const status = useChat((s) => s.status);

  const { all, constructive, structural, enabled, isDefault, unavailable } = useCouncilConfig();

  // Mirrors the store's own guard. A turn in flight would land on whichever
  // transcript loaded next, so the conversation cannot change until it finishes.
  const busy = status === 'working' || status === 'awaiting-permission';

  /**
   * Open a conversation with one executive.
   *
   * ---------------------------------------------------------------------------
   * THE CONVERSATION IS CREATED HERE, NOT HANDED TO CHAT AS AN INTENT
   * ---------------------------------------------------------------------------
   * The first attempt passed the chosen lens to the Chat screen through a
   * transient store and created the conversation in an effect there. It silently
   * did nothing: the two routes are separate chunks in the static export, and the
   * screen that received the intent never saw the value the screen that raised it
   * had written. Visual QA caught it — the header read "Council Chat" — and no
   * DOM assertion would have, because the screen renders correctly for the mode it
   * believed it was in.
   *
   * Creating it before navigating removes the hand-off altogether. Chat then has
   * nothing to interpret; it draws whichever conversation is active, and the mode
   * travels in the stored conversation record rather than in memory.
   *
   * The title uses the canonical name from the matrix, so the sidebar entry traces
   * back to the repository rather than to a label composed here.
   */
  const openLensChat = async (lens: ExecutiveLens) => {
    if (!workspacePath || busy) return;

    await startNew(workspacePath, {
      mode: { kind: 'lens', lensId: lens.id },
      title: `${lens.name} Chat`,
    });

    // Only navigate if it actually opened. Landing on Chat after a refused
    // creation would show the previous conversation as though it were the new one.
    if (useConversations.getState().activeMode.kind === 'lens') router.push('/');
  };

  if (!workspacePath) {
    return (
      <>
        <ScreenHeader title="Executive Board" />
        <EmptyState
          icon={Users}
          title="No repository selected"
          description="Choose the D.W.I.G.I repository directory in Settings. The executive definitions are read from it."
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Executive Board"
        subtitle={all.length > 0 ? `${all.length} executive lenses` : undefined}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-reading px-5 py-6">
          {unavailable ? (
            <Unavailable label="Executive matrix" reason={unavailable} />
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-muted">
                These executives deliberate together as a council. You speak to one
                Chief of Staff, who routes each decision to the perspectives it
                actually needs and returns a single recommendation — not a panel of
                opinions.
              </p>

              <Section
                title="Constructive lenses"
                note={
                  isDefault
                    ? 'All engaged. The Chief of Staff routes each decision to the two to four that fit it.'
                    : `${enabled.size} of ${constructive.length} engaged for Council deliberation. Adjust in Settings.`
                }
              >
                {constructive.map((lens) => (
                  <LensCard
                    key={lens.id}
                    lens={lens}
                    engaged={enabled.has(lens.id)}
                    busy={busy}
                    onChat={() => void openLensChat(lens)}
                  />
                ))}
              </Section>

              {structural.length > 0 && (
                <Section
                  title="Challenge lenses"
                  note="Attack the finished recommendation rather than building it. Always engaged at full deliberation depth, and not configurable."
                >
                  {structural.map((lens) => (
                    <LensCard
                      key={lens.id}
                      lens={lens}
                      engaged
                      locked
                      busy={busy}
                      onChat={() => void openLensChat(lens)}
                    />
                  ))}
                </Section>
              )}

              <p className="mt-8 text-[12.5px] leading-relaxed text-faint">
                Read from <span className="font-mono">core/executive_matrix.md</span>. This
                screen shows how the board is configured. It does not report which lenses
                ran on any particular decision — the cockpit is not told, and will not
                guess. Ask the advisor to stress-test a recommendation to see its real
                routing.
              </p>
            </>
          )}
        </div>
      </div>
    </>
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
    <section className="mt-7">
      <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-faint">{note}</p>
      <div className="mt-3.5 space-y-2.5">{children}</div>
    </section>
  );
}

interface LensCardProps {
  lens: ExecutiveLens;
  /** Engaged for Council deliberation under the current configuration. */
  engaged: boolean;
  /** Structural lens: shown as permanent rather than as a choice. */
  locked?: boolean;
  /** A turn is in flight, so the conversation cannot change yet. */
  busy: boolean;
  onChat: () => void;
}

/**
 * One executive profile.
 *
 * Shows *Objective* and *Owns* verbatim — the two fields that say what this lens
 * is for and what falls inside its remit. The remaining seven fields are the
 * reasoning machinery, and putting *Heuristics* or *Fails by* on a profile card
 * would turn a roster into a manual.
 */
function LensCard({ lens, engaged, locked, busy, onChat }: LensCardProps) {
  const objective = lens.fields.Objective ?? null;
  const owns = lens.fields.Owns ?? null;

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">{lens.name}</h3>
            <span className="text-2xs text-faint">{lens.role}</span>
          </div>
          {objective && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{objective}</p>
          )}
        </div>

        <StateChip engaged={engaged} locked={locked} />
      </div>

      {owns && (
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-faint">
          <span className="text-muted">Owns</span> · {owns}
        </p>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={onChat}
          disabled={busy}
          title={busy ? 'The advisor is still answering' : undefined}
        >
          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
          Chat with {lens.name}
        </Button>
        {!engaged && !locked && (
          <span className="text-2xs leading-relaxed text-faint">
            Disabled for Council. Direct chat still available.
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * Configured state only.
 *
 * Three states, all of which the cockpit actually knows: permanently engaged
 * (structural, per the matrix), engaged by configuration, and disabled by the
 * founder. None of them claims anything about a live turn.
 */
function StateChip({ engaged, locked }: { engaged: boolean; locked?: boolean }) {
  if (locked) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-elevated px-2 py-1 text-2xs text-muted">
        <Shield className="h-3 w-3" strokeWidth={1.75} />
        Always engaged
      </span>
    );
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-2xs',
        engaged
          ? 'border-positive/30 bg-positive/10 text-positive'
          : 'border-line bg-elevated text-faint'
      )}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', engaged ? 'bg-positive' : 'bg-faint')}
      />
      {engaged ? 'Enabled' : 'Disabled'}
    </span>
  );
}
