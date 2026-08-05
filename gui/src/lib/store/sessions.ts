'use client';

import { useMemo } from 'react';
import {
  atMostOneActive,
  COUNCIL_SESSION_KEY,
  deriveState,
  ISOLATED_COUNCIL_SESSION_KEY,
  sessionRoster,
  slotKeyForMode,
  type SessionRecord,
  type SessionSlot,
} from '@shared/sessions';
import type { ConversationSummary } from '@shared/conversations';
import { useExecutiveRoster } from '@/lib/executives';
import { useConversations } from '@/lib/store/conversations';
import { useChat } from '@/lib/store/chat';
import { useRuntime } from '@/lib/store/runtime';
import { useUi } from '@/lib/store/ui';

/**
 * Session Manager — the live view over `shared/sessions.ts`.
 *
 * ---------------------------------------------------------------------------
 * "NO UI ASSUMPTIONS" (v1.2.3 Part D), APPLIED AS A LAYERING RULE
 * ---------------------------------------------------------------------------
 * Every decision that could be tested without a browser already was — roster
 * construction, state derivation, the transition table — in `shared/sessions.ts`.
 * This file's only job is wiring: read the four stores that between them hold
 * every fact the derivation needs, and translate the pure result into the four
 * actions a screen can call. Nothing here computes a lifecycle state; it only
 * gathers the inputs `deriveState` already knows how to interpret.
 *
 * Reuse, not creation, is the default (v1.2.3 Part D/J): every action here
 * either resumes the roster's existing non-archived conversation for a slot or
 * creates one lazily on first use — never eagerly, never speculatively.
 */

function findCurrent(
  summaries: readonly ConversationSummary[],
  key: string
): ConversationSummary | null {
  const matches = summaries.filter((s) => slotKeyForMode(s.mode) === key && !s.archived);
  if (matches.length === 0) return null;
  // Newest first, matching how the list is already ordered — but sorted
  // defensively rather than trusting call-site order, since this reads whatever
  // `useConversations` currently holds.
  return matches.reduce((latest, entry) => (entry.updatedAt > latest.updatedAt ? entry : latest));
}

function hasArchived(summaries: readonly ConversationSummary[], key: string): boolean {
  return summaries.some((s) => slotKeyForMode(s.mode) === key && s.archived);
}

export interface SessionManager {
  records: SessionRecord[];
  /** True while the roster cannot be resolved — no workspace, or no lens data yet. */
  unavailable: string | null;
  /** Open (resuming, or lazily creating) the session for one slot. */
  openSession(slot: SessionSlot): Promise<void>;
  /** Reset one session. Archives the current conversation; the next open is fresh. */
  resetSession(slot: SessionSlot): Promise<void>;
  /** Reset every constructive and challenge lens's session. Council is untouched. */
  resetAllExecutives(): Promise<void>;
  /** Reset the Chief of Staff's own sessions — both Council and isolated Council. */
  resetChiefOfStaff(): Promise<void>;
  busy: boolean;
  error: string | null;
}

export function useExecutiveSessions(): SessionManager {
  const workspacePath = useUi((s) => s.workspacePath);
  const { all: lenses, unavailable: rosterUnavailable } = useExecutiveRoster();

  const summaries = useConversations((s) => s.summaries);
  const activeId = useConversations((s) => s.activeId);
  const activeMode = useConversations((s) => s.activeMode);
  const conversationsLoading = useConversations((s) => s.loading);
  const conversationsError = useConversations((s) => s.error);
  const startNew = useConversations((s) => s.startNew);
  const open = useConversations((s) => s.open);
  const archive = useConversations((s) => s.archive);

  const status = useChat((s) => s.status);
  const messages = useChat((s) => s.messages);

  const activeProviderId = useRuntime((s) => s.activeProviderId);

  const slots = useMemo(() => sessionRoster(lenses), [lenses]);

  /**
   * Is the currently open conversation's advisor message still empty?
   *
   * Distinguishes `thinking` from `responding` from a fact the chat store
   * already tracks — the streaming message's own text length — rather than a
   * second timer or heuristic.
   */
  const awaitingFirstToken = useMemo(() => {
    const last = messages[messages.length - 1];
    return Boolean(last) && Boolean(last?.streaming) && last?.text.length === 0;
  }, [messages]);

  const activeSlotKey = activeId ? slotKeyForMode(activeMode) : null;

  const records = useMemo<SessionRecord[]>(() => {
    return slots.map((slot) => {
      const current = findCurrent(summaries, slot.key);
      const isOpen = activeSlotKey === slot.key;

      const state = deriveState({
        hasCurrentConversation: current !== null,
        hasMessages: (current?.messageCount ?? 0) > 0,
        hasArchivedHistory: hasArchived(summaries, slot.key),
        isOpen,
        turnStatus: isOpen ? status : 'idle',
        awaitingFirstToken: isOpen ? awaitingFirstToken : false,
      });

      return {
        slot,
        state,
        conversationId: current?.id ?? null,
        engineSessionId: current?.sessionId ?? null,
        lastActivityAt: current?.updatedAt ?? null,
        providerId: activeProviderId,
      };
    });
  }, [slots, summaries, activeSlotKey, status, awaitingFirstToken, activeProviderId]);

  const modeFor = (slot: SessionSlot) => {
    if (slot.kind === 'lens' && slot.lensId) {
      return { kind: 'lens' as const, lensId: slot.lensId };
    }
    return slot.isolated
      ? { kind: 'council' as const, lensId: null, isolated: true }
      : { kind: 'council' as const, lensId: null };
  };

  const titleFor = (slot: SessionSlot) =>
    slot.kind === 'lens' ? `${slot.label} Chat` : slot.label;

  const openSession = async (slot: SessionSlot): Promise<void> => {
    if (!workspacePath) return;

    const current = findCurrent(summaries, slot.key);
    if (current) {
      await open(current.id);
      return;
    }

    // Lazy creation (v1.2.3 Part J): nothing is spawned until the founder
    // actually opens a slot with no current session.
    await startNew(workspacePath, { mode: modeFor(slot), title: titleFor(slot) });
  };

  const resetSession = async (slot: SessionSlot): Promise<void> => {
    const current = findCurrent(summaries, slot.key);
    if (!current) return; // Nothing to reset — already `created` or `archived`.
    await archive(current.id);
  };

  const resetAllExecutives = async (): Promise<void> => {
    // Sequential, not concurrent: `archive` shares the same host round-trip
    // path as every other conversation mutation, and running eight at once
    // would race the same underlying index file for no benefit a founder would
    // notice — this is a settings action, not a hot path.
    for (const slot of slots) {
      if (slot.kind !== 'lens') continue;
      await resetSession(slot);
    }
  };

  const resetChiefOfStaff = async (): Promise<void> => {
    for (const slot of slots) {
      if (slot.kind !== 'council') continue;
      await resetSession(slot);
    }
  };

  return {
    records,
    unavailable: !workspacePath
      ? 'No workspace selected.'
      : (rosterUnavailable ?? null),
    openSession,
    resetSession,
    resetAllExecutives,
    resetChiefOfStaff,
    busy: conversationsLoading,
    error: conversationsError,
  };
}

/** Re-exported for callers that only need the invariant check, not the hook. */
export { atMostOneActive, COUNCIL_SESSION_KEY, ISOLATED_COUNCIL_SESSION_KEY };
