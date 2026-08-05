'use client';

import { ArrowLeft, FlaskConical } from 'lucide-react';

interface IsolatedCouncilNoticeProps {
  onReturnToCouncil: () => void;
  /** True while a turn is running, when starting a new conversation is refused. */
  busy: boolean;
}

/**
 * Standing scope warning for the isolated-reasoning Council mode.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL, RATHER THAN A QUIETER LABEL
 * ---------------------------------------------------------------------------
 * `/deliberate-isolated` is experimental (`.claude/commands/deliberate-isolated.md`):
 * "It is not the default and not a replacement for `/deliberate`," and whether
 * it produces better deliberation than shared-context reasoning is explicitly
 * "genuinely unestablished" (`docs/validation/BENCHMARK.md`). A founder reading
 * a recommendation from this pipeline is reading the less-validated of the two,
 * and every Executive Action Memo looks identical regardless of which one
 * produced it — nothing else on screen would tell them.
 *
 * It also forces Full reasoning budget on every turn, including a one-line
 * question that would normally cost nothing. Both facts are disclosed here so
 * the founder who chose this mode knows what they are trading, the same way
 * `LensScopeNotice` discloses what single-agent chat costs.
 *
 * Non-dismissible for the same reason as that notice: it is the only thing on
 * screen distinguishing this recommendation's provenance from an ordinary
 * Council answer.
 */
export function IsolatedCouncilNotice({ onReturnToCouncil, busy }: IsolatedCouncilNoticeProps) {
  return (
    <div className="border-b border-accent/20 bg-accent/[0.05] px-5 py-2.5">
      <div className="mx-auto flex max-w-reading items-start gap-2.5">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">
          Each executive here reasons in its own isolated context and the Chief of Staff
          synthesizes their finished positions — no lens sees another's reasoning. This
          pipeline is <span className="font-medium text-ink">experimental</span>: it always
          runs the full board, and whether it produces better recommendations than the
          default Council is not yet established.
        </p>
        <button
          type="button"
          onClick={onReturnToCouncil}
          disabled={busy}
          title={busy ? 'The advisor is still answering' : undefined}
          className="no-drag flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-2xs text-muted transition-colors hover:bg-elevated hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} />
          Council Chat
        </button>
      </div>
    </div>
  );
}
