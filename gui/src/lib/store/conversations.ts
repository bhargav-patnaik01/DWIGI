'use client';

import { create } from 'zustand';
import {
  COUNCIL_CONVERSATION_MODE,
  type ConversationMode,
  type ConversationSummary,
  type PersistedMessage,
} from '@shared/conversations';
import { hasHost } from '@/lib/utils';
import { useChat, type ChatMessage } from '@/lib/store/chat';

interface ConversationsState {
  /** Conversations for the current workspace, newest activity first. */
  summaries: ConversationSummary[];
  activeId: string | null;
  /**
   * Engine session handle for the active conversation, or null before its first
   * turn. Passed to `transport.open` and never inspected.
   */
  activeSessionId: string | null;
  /** True when the loaded transcript had unreadable lines skipped. */
  activeIncomplete: boolean;
  /**
   * Council or single-agent, for the conversation on screen.
   *
   * Mirrored out of the active summary so the chat screen can label itself and
   * choose a runtime mode without searching the list on every render. Council
   * whenever nothing is loaded, which is what an empty screen is.
   */
  activeMode: ConversationMode;
  /**
   * How many of the transcript's messages are already on disk.
   *
   * An index into `useChat().messages`, not a total. It lives here rather than
   * inside the recorder because it must be set in the same update that changes
   * `activeId` — a cursor that lags a conversation switch by even one tick would
   * write one conversation's messages into another's file.
   */
  persistedCount: number;
  loading: boolean;
  error: string | null;

  /** Re-read the list without changing which conversation is active. */
  refresh(workspacePath: string): Promise<void>;
  /** Adopt the most recent conversation for this workspace, or start one. */
  resumeLatest(workspacePath: string): Promise<void>;
  /** Switch to a stored conversation and draw its transcript. */
  open(id: string): Promise<void>;
  /**
   * Begin an empty conversation and make it active.
   *
   * `mode` and `title` are supplied only when opening a single-agent chat. The
   * title comes from the canonical lens name in the projected matrix, so the
   * sidebar entry is grounded in the repository rather than composed here.
   */
  startNew(
    workspacePath: string,
    options?: { mode?: ConversationMode; title?: string }
  ): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * Retitle a conversation.
   *
   * The founder's words replace the founder's words. Nothing is generated, and
   * `updatedAt` is deliberately untouched — renaming is not activity, and letting
   * it reorder the list would move a months-old thread to the top of a history
   * ordered by when things were last discussed.
   */
  rename(id: string, title: string): Promise<void>;
  /** Record the engine session handle. Idempotent. */
  bindSession(sessionId: string): Promise<void>;
  /**
   * Drop the current notice.
   *
   * Called when a new turn begins, because by then the founder has moved on from
   * whatever the last one said. Safe for failures as well as refusals: a failed
   * append leaves the cursor where it was, so if the transcript still cannot be
   * written the very next flush says so again. Nothing is hidden by clearing it —
   * only stopped from outliving its own relevance.
   */
  clearError(): void;
  /**
   * Persist settled messages against the active conversation.
   *
   * `nextCursor` is supplied by the caller rather than derived from
   * `messages.length`, because the two differ legitimately: a settled message
   * with no text — a turn that failed before producing any — is consumed by the
   * cursor without being written. Deriving the cursor would leave such a message
   * blocking the queue forever, and every later message with it.
   *
   * The cursor advances only on a successful write, so a failed append is
   * retried by the next flush rather than silently dropped.
   */
  record(messages: PersistedMessage[], nextCursor: number): Promise<void>;
}

/** Stored record → the shape the transcript renders. */
function toChatMessage(message: PersistedMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    // A stored message is settled by definition — only settled messages are
    // written — so it is never rendered as streaming.
  };
}

/**
 * Is a turn still being written to the transcript on screen?
 *
 * ---------------------------------------------------------------------------
 * WHY THIS GATES EVERY CONVERSATION SWITCH
 * ---------------------------------------------------------------------------
 * The reducer appends to whatever transcript is currently loaded, and the
 * recorder persists whatever the reducer holds. Neither knows which conversation
 * it belongs to — that is the whole reason they stay simple. So if the active
 * conversation changes mid-turn, the running turn's remaining events land on the
 * newly loaded transcript and are written to *its* file: the advisor's answer to
 * one question, filed under another, with nothing on screen to suggest anything
 * went wrong.
 *
 * `awaiting-permission` counts as in flight. The turn is paused, not finished,
 * and it resumes into whatever transcript is loaded when the founder answers.
 *
 * The switch is refused rather than queued or forced. Cancelling the turn on the
 * founder's behalf would discard reasoning they are waiting on; queueing it would
 * make a click take effect minutes later against a screen they have stopped
 * looking at. Being told to finish or stop the turn is something they can act on.
 */
function turnInFlight(): boolean {
  const { status } = useChat.getState();
  return status === 'working' || status === 'awaiting-permission';
}

const TURN_IN_FLIGHT = 'Finish or stop the current turn before changing conversations.';

/**
 * Conversation history and the resume pointer.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS STORE IS FOR, AND THE ONE THING IT DOES NOT CLAIM
 * ---------------------------------------------------------------------------
 * It holds the list of past conversations and which one is on screen, and it
 * carries the opaque session handle that lets the engine continue where it left
 * off. It performs no interpretation: it does not title conversations from their
 * content, group them by topic, or decide which matter. Titles are the founder's
 * own first words, truncated by `deriveTitle` in the shared contract.
 *
 * The handle is a *hope*, not a guarantee. The engine may no longer hold the
 * session it names — history can be pruned, and a repository can move between
 * machines. When that happens the transport says so and continues without prior
 * context; this store deliberately does not pretend to detect it in advance,
 * because a check would be a guess about another application's storage.
 */
export const useConversations = create<ConversationsState>()((set, get) => ({
  summaries: [],
  activeId: null,
  activeSessionId: null,
  activeIncomplete: false,
  activeMode: COUNCIL_CONVERSATION_MODE,
  persistedCount: 0,
  loading: false,
  error: null,

  refresh: async (workspacePath) => {
    if (!hasHost()) return;
    try {
      const summaries = await window.eis!.conversations.list(workspacePath);
      set({ summaries });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not list conversations.' });
    }
  },

  resumeLatest: async (workspacePath) => {
    if (!hasHost()) return;
    set({ loading: true, error: null });
    try {
      const summaries = await window.eis!.conversations.list(workspacePath);
      set({ summaries });

      const latest = summaries[0];
      if (!latest) {
        set({ loading: false });
        // No conversation is created here. An empty conversation would appear in
        // the founder's history as a thread they never had, and every launch
        // would add another.
        return;
      }

      set({ loading: false });
      await get().open(latest.id);
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not resume.',
      });
    }
  },

  open: async (id) => {
    if (!hasHost()) return;
    if (get().activeId === id) return;
    if (turnInFlight()) {
      set({ error: TURN_IN_FLIGHT });
      return;
    }

    set({ loading: true, error: null });
    const result = await window.eis!.conversations.load(id);

    if (!result.ok) {
      set({ loading: false, error: result.reason });
      return;
    }

    const { summary, messages, incomplete } = result.value;

    // Everything already read from disk is by definition already on disk.
    set({
      activeId: summary.id,
      activeSessionId: summary.sessionId,
      activeIncomplete: incomplete,
      activeMode: summary.mode,
      persistedCount: messages.length,
      loading: false,
    });

    useChat.getState().hydrate({
      messages: messages.map(toChatMessage),
      sessionId: summary.sessionId,
    });
  },

  startNew: async (workspacePath, options) => {
    if (!hasHost()) return;
    if (turnInFlight()) {
      set({ error: TURN_IN_FLIGHT });
      return;
    }
    set({ loading: true, error: null });

    const result = await window.eis!.conversations.create(workspacePath, options);
    if (!result.ok) {
      set({ loading: false, error: result.reason });
      return;
    }

    set((state) => ({
      summaries: [result.value, ...state.summaries],
      activeId: result.value.id,
      activeSessionId: null,
      activeIncomplete: false,
      // Read back from the stored summary rather than from `options`: the host
      // normalises the mode, and the screen must label what was actually created.
      activeMode: result.value.mode,
      persistedCount: 0,
      loading: false,
    }));

    useChat.getState().hydrate({ messages: [], sessionId: null });
  },

  remove: async (id) => {
    if (!hasHost()) return;
    // Only the conversation being written to is protected. Deleting some other
    // thread while a turn runs misfiles nothing, and refusing it would be a
    // restriction with no reason behind it.
    if (get().activeId === id && turnInFlight()) {
      set({ error: TURN_IN_FLIGHT });
      return;
    }

    const result = await window.eis!.conversations.remove(id);
    if (!result.ok) {
      set({ error: result.reason });
      return;
    }

    const remaining = get().summaries.filter((entry) => entry.id !== id);
    set({ summaries: remaining });

    // Deleting the conversation on screen leaves the screen empty rather than
    // silently jumping to another thread, which would look like data loss.
    if (get().activeId === id) {
      set({
        activeId: null,
        activeSessionId: null,
        activeIncomplete: false,
        activeMode: COUNCIL_CONVERSATION_MODE,
        persistedCount: 0,
      });
      useChat.getState().hydrate({ messages: [], sessionId: null });
    }
  },

  clearError: () => set({ error: null }),

  rename: async (id, title) => {
    if (!hasHost()) return;

    // Trimming and length are the host's rules, applied there so the renderer
    // cannot disagree with what ends up on disk. An empty title is refused rather
    // than replaced with something invented.
    const result = await window.eis!.conversations.rename(id, title);
    if (!result.ok) {
      set({ error: result.reason });
      return;
    }

    // Order is not touched. See the note on the action.
    set((state) => ({
      error: null,
      summaries: state.summaries.map((entry) => (entry.id === id ? result.value : entry)),
    }));
  },

  bindSession: async (sessionId) => {
    const { activeId, activeSessionId } = get();
    if (!hasHost() || !activeId) return;
    if (activeSessionId === sessionId) return;

    const result = await window.eis!.conversations.bindSession(activeId, sessionId);
    if (!result.ok) {
      set({ error: result.reason });
      return;
    }

    set((state) => ({
      activeSessionId: sessionId,
      summaries: state.summaries.map((entry) =>
        entry.id === activeId ? result.value : entry
      ),
    }));
  },

  record: async (messages, nextCursor) => {
    const { activeId, persistedCount } = get();
    if (!hasHost() || !activeId) return;
    if (nextCursor <= persistedCount) return;

    // Nothing worth writing, but the cursor still has ground to cover: settled
    // messages with no text. Advance past them so they cannot block the queue.
    if (messages.length === 0) {
      set({ persistedCount: nextCursor });
      return;
    }

    const result = await window.eis!.conversations.append(activeId, messages);
    if (!result.ok) {
      // A failed write is surfaced, not swallowed. A founder who believes a
      // deliberation was saved and finds it gone is worse off than one told now.
      // The cursor is left alone, so the next flush tries these messages again.
      set({ error: `Could not save the transcript: ${result.reason}` });
      return;
    }

    set((state) => ({
      persistedCount: nextCursor,
      // Moved to the front: the list is ordered by last activity, and this
      // conversation just became the most recent.
      summaries: [
        result.value,
        ...state.summaries.filter((entry) => entry.id !== activeId),
      ],
    }));
  },
}));
