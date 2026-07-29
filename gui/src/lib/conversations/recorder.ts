'use client';

import type { AdvisorEvent } from '@shared/advisor';
import type { PersistedMessage } from '@shared/conversations';
import { getAdvisorTransport } from '@/lib/advisor/transport';
import { useChat, type ChatMessage } from '@/lib/store/chat';
import { useConversations } from '@/lib/store/conversations';

/**
 * Transcript recorder — the only thing that decides when a message is durable.
 *
 * ---------------------------------------------------------------------------
 * WHY IT PERSISTS WHAT THE STORE HOLDS, RATHER THAN WHAT THE STREAM SAID
 * ---------------------------------------------------------------------------
 * The obvious design is to accumulate text from `text-delta` events and write
 * that. It is also wrong. The reducer already resolves the authoritative text —
 * `message-complete` *replaces* the streamed buffer rather than appending to it,
 * precisely because concatenated deltas can drop a chunk. A recorder that did
 * its own accumulation would be a second, weaker implementation of that rule,
 * and the failure it produces is the one that hides best: the screen shows a
 * complete recommendation while the file holds a truncated one.
 *
 * So the recorder writes exactly what the transcript is displaying. If the two
 * ever disagree, there is one bug, not two.
 *
 * ---------------------------------------------------------------------------
 * WHY IT LIVES HERE AND NOT IN THE CHAT PAGE
 * ---------------------------------------------------------------------------
 * The page owns wiring and contains no `event.kind` branching by design, so that
 * it cannot start deciding what events mean. The two branches persistence needs
 * belong somewhere; this module is that somewhere.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------
 * It does not persist a streaming message, summarise, tag, or classify anything,
 * and it writes no activity timeline or permission notice. Those describe a live
 * turn. Redrawing yesterday's timeline against today's session would assert that
 * the advisor did that work in this session, which it did not.
 */

/** A message is durable once it has settled. Streaming text never is. */
function toPersisted(message: ChatMessage): PersistedMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
  };
}

/**
 * Writes are serialised.
 *
 * Two flushes overlapping would both read the same cursor and append the same
 * messages twice, and duplicated turns in a founder's record of a decision are
 * indistinguishable from the founder having actually said it twice.
 */
let chain: Promise<void> = Promise.resolve();

function flush(): void {
  chain = chain.then(doFlush, doFlush);
}

async function doFlush(): Promise<void> {
  const { messages } = useChat.getState();
  const { activeId, persistedCount, record } = useConversations.getState();
  if (!activeId) return;

  /*
   * Walk the contiguous settled prefix from the cursor.
   *
   * Contiguous, not filtered: the cursor is a position, so it may only advance
   * over messages it has actually passed. Stopping at the first unsettled
   * message is what guarantees that — and only the last message can be
   * unsettled, since the reducer appends and never inserts.
   */
  const batch: PersistedMessage[] = [];
  let cursor = persistedCount;

  while (cursor < messages.length) {
    const message = messages[cursor];
    if (!message) break;
    // Still streaming: it is not final text yet, and everything after it waits.
    if (message.streaming) break;
    // Settled but empty — a turn that produced no text. Passed over, not stored:
    // an empty message in a transcript reads as the advisor having said nothing
    // when in fact it failed.
    if (message.text.length > 0) batch.push(toPersisted(message));
    cursor += 1;
  }

  if (cursor === persistedCount) return;
  await record(batch, cursor);
}

/**
 * Bind the engine session handle for the active conversation.
 *
 * Read from diagnostics rather than from `turn-started`, because the transport
 * may legitimately change the session mid-turn: when the engine has no record of
 * the session it was asked to resume, it starts a fresh one and says so. The
 * handle we must store is whichever one the runtime actually ended up using, and
 * diagnostics is the contract's side-effect-free way to ask.
 */
async function bindSession(): Promise<void> {
  const { activeId, bindSession: bind } = useConversations.getState();
  if (!activeId) return;
  try {
    const diagnostics = await getAdvisorTransport().getDiagnostics();
    if (diagnostics.sessionId) await bind(diagnostics.sessionId);
  } catch {
    // Diagnostics is a convenience, not a dependency. Failing to read it costs
    // resume on the next launch; failing the turn over it would cost the answer.
  }
}

/**
 * Begin recording. Returns an unsubscribe function — always call it.
 *
 * Mounted once by the chat screen. Safe to call again on remount: the returned
 * function detaches the only listener it added.
 */
export function startConversationRecorder(): () => void {
  return getAdvisorTransport().subscribe((event: AdvisorEvent) => {
    switch (event.kind) {
      case 'turn-started':
        // A new turn retires the last notice. See `clearError` for why this
        // cannot hide a real save failure.
        useConversations.getState().clearError();
        // The founder's message is in the store by now, and this is the earliest
        // point it can be made durable. A crash mid-turn then loses the advisor's
        // reply — which can be asked again — rather than the question.
        void bindSession();
        flush();
        return;

      case 'turn-complete':
        flush();
        // Re-read after the turn: a session recovery during it would have changed
        // the handle, and the stored one must be the handle that now works.
        void bindSession();
        return;

      case 'error':
        // The reducer settles every streaming message on an error, so whatever
        // text did arrive is final and worth keeping.
        flush();
        return;

      default:
        return;
    }
  });
}
