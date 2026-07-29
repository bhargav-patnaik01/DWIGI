'use client';

import { ArrowLeft, User } from 'lucide-react';

interface LensScopeNoticeProps {
  /** Canonical executive name from the projected matrix. */
  lensName: string;
  onReturnToCouncil: () => void;
  /** True while a turn is running, when starting a new conversation is refused. */
  busy: boolean;
}

/**
 * Standing scope warning for a single-agent conversation.
 *
 * ---------------------------------------------------------------------------
 * WHY IT DOES NOT DISMISS
 * ---------------------------------------------------------------------------
 * The V1 notice above it is dismissible because it says the same thing on every
 * screen. This one does not, because it is the only thing on screen distinguishing
 * one executive's view from the board's recommendation. A founder who dismissed it
 * on Tuesday and reads a CFO answer on Friday would have nothing telling them the
 * Risk Officer never saw it.
 *
 * It is deliberately quiet rather than alarming — persistent and loud is a
 * combination people learn to stop seeing.
 */
export function LensScopeNotice({ lensName, onReturnToCouncil, busy }: LensScopeNoticeProps) {
  return (
    <div className="border-b border-accent/20 bg-accent/[0.05] px-5 py-2.5">
      <div className="mx-auto flex max-w-reading items-start gap-2.5">
        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted">
          You are speaking directly with the{' '}
          <span className="font-medium text-ink">{lensName}</span> perspective. The rest of
          the Executive Council is not engaged, so this answer is shaped by one mandate and
          may differ from the Council&rsquo;s recommendation.
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
