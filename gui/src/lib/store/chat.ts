'use client';

import { create } from 'zustand';
import type {
  ActivityEvent,
  AdvisorEvent,
  PermissionDeniedEvent,
  TurnStatus,
} from '@shared/advisor';

export interface ChatMessage {
  id: string;
  role: 'user' | 'advisor';
  text: string;
  createdAt: number;
  streaming?: boolean;
}

export interface ActivityItem {
  id: string;
  label: string;
  category: ActivityEvent['category'];
  state: ActivityEvent['state'];
  at: number;
}

export interface TurnStats {
  durationMs?: number;
  costUsd?: number;
  turns?: number;
}

interface ChatState {
  messages: ChatMessage[];
  activity: ActivityItem[];
  status: TurnStatus;
  sessionId: string | null;
  currentTurnId: string | null;
  pendingPermissions: PermissionDeniedEvent[];
  notices: string[];
  lastError: string | null;
  lastStats: TurnStats | null;

  appendUserMessage(text: string): void;
  applyEvent(event: AdvisorEvent): void;
  dismissPermission(requestId: string): void;
  setStatus(status: TurnStatus): void;
  /** Replace the transcript with a stored one. See the note on the action. */
  hydrate(input: { messages: ChatMessage[]; sessionId: string | null }): void;
  reset(): void;
}

/**
 * ---------------------------------------------------------------------------
 * REDUCER CONTRACT
 * ---------------------------------------------------------------------------
 * This reducer is permitted to: append, replace, buffer, remove, update status.
 *
 * It is forbidden from: inferring meaning, reordering reasoning, synthesising
 * activities, or classifying events.
 *
 * Concretely, every branch below is a mechanical mapping from one event kind to
 * one state mutation. There is no branch that examines event *content* to decide
 * what it means. Labels, categories, and provenance all arrive pre-computed from
 * the transport, which owns parsing — if a label is wrong, the bug is in
 * `electron/bridge/events.ts`, never here.
 *
 * Two rules that are easy to violate accidentally:
 *
 *   1. Deltas are appended in arrival order and never sorted. The runtime's order
 *      is the truth; imposing our own would be reordering reasoning.
 *   2. `message-complete` REPLACES the buffered text rather than being appended
 *      to it. The complete message is authoritative — concatenated deltas can
 *      drop a chunk, and a silently truncated recommendation is worse than a
 *      visibly missing one.
 */
export const useChat = create<ChatState>()((set) => ({
  messages: [],
  activity: [],
  status: 'idle',
  sessionId: null,
  currentTurnId: null,
  pendingPermissions: [],
  notices: [],
  lastError: null,
  lastStats: null,

  appendUserMessage: (text) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          text,
          createdAt: Date.now(),
        },
      ],
      lastError: null,
    })),

  setStatus: (status) => set({ status }),

  /**
   * Load a stored transcript.
   *
   * ---------------------------------------------------------------------------
   * THIS REPLACES; IT NEVER MERGES
   * ---------------------------------------------------------------------------
   * Merging a stored transcript into a live one would require deciding how two
   * histories interleave, and the store has no basis for that — it would be
   * inventing an order the founder never saw. So hydration is only ever the
   * first thing that happens to a conversation, and switching conversations
   * replaces wholesale.
   *
   * Everything not part of the transcript is cleared rather than carried over.
   * Activity, notices, and errors all describe a *turn*, and a turn that ended
   * before the app closed has no live meaning; showing yesterday's timeline
   * against today's session would be a fabrication. Pending permissions are
   * dropped for a stronger reason: a grant authorises the next attempt, and
   * silently carrying an unanswered one across a restart would let a stale
   * decision authorise a write the founder is no longer looking at.
   */
  hydrate: ({ messages, sessionId }) =>
    set({
      messages,
      sessionId,
      activity: [],
      status: 'idle',
      currentTurnId: null,
      pendingPermissions: [],
      notices: [],
      lastError: null,
      lastStats: null,
    }),

  dismissPermission: (requestId) =>
    set((s) => ({
      pendingPermissions: s.pendingPermissions.filter((p) => p.requestId !== requestId),
      // Status returns to working only if the turn is still live; otherwise idle.
      status: s.currentTurnId ? s.status : 'idle',
    })),

  applyEvent: (event) =>
    set((s) => {
      switch (event.kind) {
        /* ---------------------------------------------------- status: buffer */
        case 'turn-started':
          return {
            status: 'working',
            sessionId: event.sessionId,
            currentTurnId: event.turnId,
            activity: [],
            notices: [],
            lastStats: null,
            // Open an empty advisor message to receive deltas.
            messages: [
              ...s.messages,
              {
                id: `a_${event.turnId}`,
                role: 'advisor' as const,
                text: '',
                createdAt: Date.now(),
                streaming: true,
              },
            ],
          };

        /* ------------------------------------------------------ text: append */
        case 'text-delta': {
          const messages = [...s.messages];
          const index = messages.findIndex((m) => m.id === `a_${event.turnId}`);
          if (index === -1) return {};
          const existing = messages[index];
          if (!existing) return {};
          messages[index] = { ...existing, text: existing.text + event.text };
          return { messages };
        }

        /* --------------------------------------------------- text: replace */
        case 'message-complete': {
          const messages = [...s.messages];
          const index = messages.findIndex((m) => m.id === `a_${event.turnId}`);
          if (index === -1) {
            return {
              messages: [
                ...s.messages,
                {
                  id: `a_${event.turnId}`,
                  role: 'advisor' as const,
                  text: event.text,
                  createdAt: Date.now(),
                },
              ],
            };
          }
          const existing = messages[index];
          if (!existing) return {};
          messages[index] = { ...existing, text: event.text, streaming: false };
          return { messages };
        }

        /* ------------------------------- activity: append, or update in place */
        case 'activity': {
          const index = s.activity.findIndex((a) => a.id === event.activityId);
          if (index === -1) {
            // A terminal state for an activity we never saw start: ignore rather
            // than fabricate a started entry for it.
            if (event.state !== 'started') return {};
            return {
              activity: [
                ...s.activity,
                {
                  id: event.activityId,
                  label: event.label,
                  category: event.category,
                  state: event.state,
                  at: Date.now(),
                },
              ],
            };
          }
          const activity = [...s.activity];
          const existing = activity[index];
          if (!existing) return {};
          activity[index] = {
            ...existing,
            state: event.state,
            // Keep the original label: later events carry none, and substituting
            // one would be synthesising.
            label: event.label || existing.label,
          };
          return { activity };
        }

        /* ------------------------------------------ permissions: append/status */
        case 'permission-denied':
          return {
            pendingPermissions: [...s.pendingPermissions, event],
            status: 'awaiting-permission',
          };

        /* ----------------------------------------------------- notices: append */
        case 'runtime-notice':
          return { notices: [...s.notices.slice(-4), event.message] };

        /* ------------------------------------------------------ turn: complete */
        case 'turn-complete': {
          const messages = s.messages.map((m) =>
            m.id === `a_${event.turnId}` ? { ...m, streaming: false } : m
          );
          return {
            messages,
            currentTurnId: null,
            status: s.pendingPermissions.length > 0 ? 'awaiting-permission' : 'idle',
            lastStats: event.stats ?? null,
            activity: s.activity.map((a) =>
              a.state === 'started' ? { ...a, state: 'completed' as const } : a
            ),
          };
        }

        /* ---------------------------------------------------------- error */
        case 'error': {
          const messages = s.messages.map((m) =>
            m.streaming ? { ...m, streaming: false } : m
          );
          return {
            messages,
            lastError: event.message,
            status: event.fatal ? 'error' : s.status === 'working' ? 'idle' : s.status,
            currentTurnId: event.fatal ? null : s.currentTurnId,
          };
        }

        default:
          return {};
      }
    }),

  reset: () =>
    set({
      messages: [],
      activity: [],
      status: 'idle',
      sessionId: null,
      currentTurnId: null,
      pendingPermissions: [],
      notices: [],
      lastError: null,
      lastStats: null,
    }),
}));
