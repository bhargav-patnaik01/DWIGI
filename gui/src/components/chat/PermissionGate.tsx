'use client';

import { useCallback } from 'react';
import { PermissionDialog } from '@/components/chat/PermissionDialog';
import { getAdvisorTransport, type PermissionDecision } from '@/lib/advisor/transport';
import { useChat } from '@/lib/store/chat';

/**
 * Renders the permission dialog wherever the founder happens to be.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS MOUNTED IN THE SHELL AND NOT ON THE CHAT SCREEN
 * ---------------------------------------------------------------------------
 * The first version of this lived inside the chat page, next to the transcript
 * it belongs to. That is where it *looks* like it belongs, and it was wrong:
 * the engine is blocked application-wide, not screen-wide. Navigating to
 * Dashboard unmounted the dialog while leaving the advisor stopped, so the
 * status pill read "Awaiting permission" with nothing on screen able to give
 * one. Returning to chat recovered it, so it was not a permanent deadlock —
 * but an advisor that is stuck until you guess which screen to stand on is not
 * meaningfully better than one that is stuck.
 *
 * Mounting it in the shell makes the scope of the block match the scope of the
 * dialog. That is the whole justification, and it is why this component knows
 * nothing about chat beyond the store it reads.
 */
export function PermissionGate() {
  const pending = useChat((s) => s.pendingPermissions);
  const dismissPermission = useChat((s) => s.dismissPermission);

  /*
   * Answer first, then drop it locally.
   *
   * The engine is stopped, so the write to the runtime is what matters and must
   * not wait on a React state update. Dismissal is only the local consequence:
   * it closes the dialog and, when nothing else is queued, returns the status to
   * `working` — because the advisor really is working again by then.
   */
  const decide = useCallback(
    (requestId: string, decision: PermissionDecision) => {
      void getAdvisorTransport().respondToPermission(requestId, decision);
      dismissPermission(requestId);
    },
    [dismissPermission]
  );

  const cancelTurn = useCallback(() => {
    void getAdvisorTransport().cancel();
  }, []);

  // One at a time, in the order the engine raised them.
  const head = pending[0];
  if (!head) return null;

  return (
    <PermissionDialog
      key={head.requestId}
      request={head}
      queueLength={pending.length}
      onDecide={decide}
      onCancelTurn={cancelTurn}
    />
  );
}
