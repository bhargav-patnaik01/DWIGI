'use client';

import { useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PermissionDecision, PermissionRequestEvent } from '@shared/advisor';

/**
 * The advisor is stopped, waiting for an answer.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MODAL AND THE THING IT REPLACED WAS NOT
 * ---------------------------------------------------------------------------
 * `PermissionNotice` was an inline card because it reported something that had
 * already failed — there was nothing to wait for, and blocking the screen over
 * a past event would have been theatre.
 *
 * This is the opposite situation. A real process is halted mid-turn and will
 * stay halted until this is answered. A card the founder can scroll past would
 * misrepresent that as optional, and the advisor would appear to hang for
 * reasons they cannot see. The modal is honest about who is waiting for whom.
 *
 * ---------------------------------------------------------------------------
 * THE COPY IS LOAD-BEARING, IN THE OPPOSITE DIRECTION FROM BEFORE
 * ---------------------------------------------------------------------------
 * The old copy went out of its way to say the action had *already been blocked*
 * and that approving it only authorised a fresh attempt. Every word of that is
 * now false. Nothing has happened yet; allowing completes the action inside the
 * turn already running. Saying anything weaker would understate what the button
 * does, and this is a button that writes to disk.
 */
export function PermissionDialog({
  request,
  queueLength,
  onDecide,
  onCancelTurn,
}: {
  request: PermissionRequestEvent;
  /** Total requests outstanding, including this one. */
  queueLength: number;
  onDecide: (requestId: string, decision: PermissionDecision) => void;
  onCancelTurn: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  /*
   * Focus moves to the panel itself rather than to a button.
   *
   * Focusing an action would make Enter — pressed by someone still reading —
   * commit that action. For a dialog that can authorise a filesystem write,
   * the default keystroke must not be one of the answers.
   */
  useEffect(() => {
    panel.current?.focus();
  }, [request.requestId]);

  /*
   * Escape denies rather than dismisses, and Tab cannot leave.
   *
   * Escape: a dialog that could be closed without answering would leave the
   * engine blocked with nothing on screen explaining why — the exact deadlock
   * the transport contract's sixth invariant forbids. So Escape is a real
   * decision, and it is the safe one.
   *
   * Tab: `aria-modal` tells assistive technology this is modal but does nothing
   * to the focus ring. Without a trap, Tab walks out of the dialog and into the
   * sidebar behind it — a keyboard user could focus and activate navigation that
   * is visually blocked, while the advisor stays stopped. The cycle is computed
   * on each keypress rather than cached, because the panel's controls change
   * with the request.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDecide(request.requestId, 'deny');
        return;
      }

      if (event.key !== 'Tab') return;
      const root = panel.current;
      if (!root) return;

      const focusable = [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        // Nothing to cycle through; keep focus on the panel rather than letting
        // it escape to the screen behind.
        event.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Wrap at both ends, and pull focus in when it is on the panel itself.
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === root)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecide, request.requestId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        className={
          'no-drag w-full max-w-[520px] overflow-hidden rounded-2xl border border-line ' +
          'bg-surface shadow-2xl outline-none animate-fade-up'
        }
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-caution" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <h2 id="permission-title" className="text-[13px] font-semibold text-ink">
              The advisor is asking permission
            </h2>
            <p className="mt-0.5 text-2xs text-faint">
              It has paused and will not continue until you answer.
            </p>
          </div>
          {queueLength > 1 && (
            <span className="shrink-0 rounded-md bg-elevated px-1.5 py-0.5 text-2xs text-muted">
              1 of {queueLength}
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink">
            <span className="font-mono text-[13px] font-medium text-accent">
              {request.tool}
            </span>
            {' — '}
            {request.summary}
          </p>

          {request.targets.length > 0 && (
            <ul className="mt-3 space-y-1">
              {request.targets.map((target) => (
                <li
                  key={target}
                  className="break-all rounded-md bg-elevated px-2 py-1.5 font-mono text-2xs text-muted"
                >
                  {target}
                </li>
              ))}
            </ul>
          )}

          {request.detail && (
            <pre
              className={
                'mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md ' +
                'border border-line bg-canvas px-2.5 py-2 font-mono text-2xs leading-relaxed text-muted'
              }
            >
              {request.detail}
            </pre>
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t border-line px-5 py-3.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => onDecide(request.requestId, 'allow')}
          >
            Allow Once
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDecide(request.requestId, 'deny')}
          >
            Deny
          </Button>
          {/* Pushed away from the answers: ending the turn is a different kind
              of act from answering the question, and adjacency invites misclicks. */}
          <Button size="sm" variant="danger" className="ml-auto" onClick={onCancelTurn}>
            Cancel Turn
          </Button>
        </div>
      </div>
    </div>
  );
}
