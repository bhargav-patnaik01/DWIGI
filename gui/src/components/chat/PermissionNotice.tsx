'use client';

import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PermissionDeniedEvent } from '@shared/advisor';

/**
 * A refused action, with the user's decision on whether to authorise a retry.
 *
 * ---------------------------------------------------------------------------
 * THE COPY HERE IS LOAD-BEARING
 * ---------------------------------------------------------------------------
 * The runtime does not pause for consent in programmatic mode — it refuses the
 * action, tells the advisor, and continues. So this is a *notice about something
 * that already failed*, not a prompt holding a process open.
 *
 * Wording it as "Approve / Deny" alone would imply the attempt is waiting, and
 * the user would reasonably expect approval to complete it. It will not. The
 * text therefore states plainly that the action was blocked and that allowing it
 * authorises a fresh attempt, which they must ask for again.
 *
 * Overstating what this button does would be the interface lying about the
 * system's actual behaviour, which is the one thing this project has refused to
 * do at every prior gate.
 */
export function PermissionNotice({
  request,
  onDecision,
}: {
  request: PermissionDeniedEvent;
  onDecision: (requestId: string, decision: 'allow' | 'deny') => void;
}) {
  return (
    <div className="rounded-xl border border-caution/30 bg-caution/5 p-3.5 animate-fade-up">
      <div className="flex gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-caution" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">
            Blocked: {request.tool} was not permitted
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{request.summary}</p>

          {request.targets.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {request.targets.map((target) => (
                <li key={target} className="truncate font-mono text-2xs text-faint">
                  {target}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2.5 text-2xs leading-relaxed text-faint">
            This action has already failed, and the advisor has already observed the
            failure. Granting permission authorises a{' '}
            <em className="not-italic text-muted">new attempt</em> — ask again to have it
            carried out.
          </p>

          <div className="mt-3 flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecision(request.requestId, 'allow')}
            >
              Retry with Permission
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDecision(request.requestId, 'deny')}
            >
              Keep Blocked
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
