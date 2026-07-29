/**
 * Conversation store — the cockpit's own transcript, on the host's disk.
 *
 * ---------------------------------------------------------------------------
 * THE ONE WRITE PATH IN THIS APPLICATION, AND ITS FENCE
 * ---------------------------------------------------------------------------
 * `electron/repo/` is read-only by construction: it does not import a single
 * mutating filesystem call. This module does write, so the fence has to be
 * explicit instead of structural:
 *
 *   Every path this module touches is built from `rootDir` plus a validated
 *   UUID. `rootDir` is supplied once by `main.ts` as the host's application-data
 *   directory. No caller can name a path, so no caller can reach the repository.
 *
 * That is why `rootDir` is a constructor argument rather than being read from
 * Electron here: the module has no opinion about where it lives, cannot be
 * pointed at the repository by accident, and can be exercised by the test suite
 * without an Electron process.
 *
 * ---------------------------------------------------------------------------
 * WHY JSONL FOR BODIES AND JSON FOR THE INDEX
 * ---------------------------------------------------------------------------
 * Messages are appended, never rewritten. A transcript grows for the life of a
 * conversation, and rewriting the whole array on every turn would mean a
 * founder's longest deliberation is the one most likely to be lost to a torn
 * write. Appending a line is one syscall, and a torn *last* line is detectable
 * and discardable — earlier turns are already durable.
 *
 * The index is small, needs whole-file consistency, and is rewritten via
 * temp-file-and-rename so a crash mid-write leaves the previous index intact
 * rather than a truncated one.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE WILL NOT DO
 * ---------------------------------------------------------------------------
 * It does not prune, cap, expire, or compact anything. A founder's record of how
 * they decided is not cache, and silently discarding the oldest of it to save
 * disk would destroy the one asset this system is built to accumulate. Deletion
 * happens only when the founder asks for it.
 */

import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  CONVERSATION_SCHEMA_VERSION,
  deriveTitle,
  isConversationId,
  NEW_CONVERSATION_TITLE,
  readConversationMode,
  TITLE_MAX_LENGTH,
  type ConversationMode,
  type ConversationResult,
  type ConversationSummary,
  type ConversationTranscript,
  type PersistedMessage,
} from '../../shared/conversations';

const INDEX_FILE = 'index.json';

/** Envelope written around every stored message, so a format change is detectable. */
interface StoredLine {
  v: number;
  message: PersistedMessage;
}

interface StoredIndex {
  v: number;
  conversations: ConversationSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Accept a summary only if every field is the type it claims to be. */
function readSummary(value: unknown): ConversationSummary | null {
  if (!isRecord(value)) return null;
  if (!isConversationId(value.id)) return null;
  if (typeof value.workspacePath !== 'string') return null;
  if (typeof value.title !== 'string') return null;
  if (typeof value.createdAt !== 'number') return null;
  if (typeof value.updatedAt !== 'number') return null;
  if (typeof value.messageCount !== 'number') return null;
  const sessionId =
    typeof value.sessionId === 'string' && value.sessionId.length > 0
      ? value.sessionId
      : null;
  return {
    id: value.id,
    sessionId,
    workspacePath: value.workspacePath,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messageCount: value.messageCount,
    // Absent on every record written before single-agent chat existed, and those
    // records were Council conversations. Defaulted rather than rejected, so the
    // feature does not cost anyone their history.
    mode: readConversationMode(value.mode),
  };
}

function readMessage(value: unknown): PersistedMessage | null {
  if (!isRecord(value)) return null;
  if (value.v !== CONVERSATION_SCHEMA_VERSION) return null;
  const message = value.message;
  if (!isRecord(message)) return null;
  if (typeof message.id !== 'string') return null;
  if (message.role !== 'user' && message.role !== 'advisor') return null;
  if (typeof message.text !== 'string') return null;
  if (typeof message.createdAt !== 'number') return null;
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
  };
}

export class ConversationStore {
  /** Index cache. Read once, written through on every mutation. */
  private index: ConversationSummary[] | null = null;

  /**
   * Serialises every mutation.
   *
   * Two concurrent appends racing on the index would lose one message count, and
   * two concurrent index writes could interleave temp files. Chaining is enough
   * here — this is one desktop user, not a server.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly rootDir: string) {}

  /** Run `work` after every previously queued mutation, never concurrently. */
  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    // Swallow on the chain only; the returned promise keeps its rejection.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private transcriptPath(id: string): string {
    // `id` is a validated UUID, so this cannot escape `rootDir`.
    return path.join(this.rootDir, `${id}.jsonl`);
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  /* -------------------------------------------------------------------- index */

  private async readIndex(): Promise<ConversationSummary[]> {
    if (this.index) return this.index;

    try {
      const raw = JSON.parse(await readFile(path.join(this.rootDir, INDEX_FILE), 'utf8'));
      const stored = isRecord(raw) ? (raw as unknown as StoredIndex) : null;
      const list = stored && Array.isArray(stored.conversations) ? stored.conversations : [];
      // Unreadable entries are dropped, not repaired. A half-understood index
      // entry pointing at a real transcript would mislabel it.
      this.index = list
        .map(readSummary)
        .filter((entry): entry is ConversationSummary => entry !== null);
    } catch {
      // Absent or corrupt: an empty index is the correct first-run state, and
      // the transcripts themselves are untouched either way.
      this.index = [];
    }

    return this.index;
  }

  /**
   * Atomic index write: temp file, then rename over the original.
   *
   * `rename` replaces the destination on both POSIX and Windows, so a reader
   * sees either the whole previous index or the whole new one — never a
   * half-written file.
   */
  private async writeIndex(list: ConversationSummary[]): Promise<void> {
    await this.ensureRoot();
    const target = path.join(this.rootDir, INDEX_FILE);
    const temp = `${target}.${process.pid}.tmp`;
    const payload: StoredIndex = { v: CONVERSATION_SCHEMA_VERSION, conversations: list };
    await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    try {
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    this.index = list;
  }

  /** Apply a change to one entry and persist the index. Newest first on read. */
  private async patch(
    id: string,
    change: (entry: ConversationSummary) => ConversationSummary
  ): Promise<ConversationResult<ConversationSummary>> {
    const list = [...(await this.readIndex())];
    const at = list.findIndex((entry) => entry.id === id);
    if (at === -1) return { ok: false, reason: 'No such conversation.' };
    const existing = list[at];
    if (!existing) return { ok: false, reason: 'No such conversation.' };
    const updated = change(existing);
    list[at] = updated;
    await this.writeIndex(list);
    return { ok: true, value: updated };
  }

  /* ------------------------------------------------------------------ queries */

  /**
   * Conversations for one workspace, newest activity first.
   *
   * Scoped by workspace because engine sessions are scoped to a working
   * directory: offering a conversation from another repository would offer a
   * resume that cannot succeed.
   */
  async list(workspacePath: string): Promise<ConversationSummary[]> {
    const wanted = path.resolve(workspacePath);
    const list = await this.readIndex();
    return list
      .filter((entry) => path.resolve(entry.workspacePath) === wanted)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Load one transcript.
   *
   * A missing body file is not an error: a conversation created but never sent
   * to legitimately has no messages yet.
   */
  async load(id: string): Promise<ConversationResult<ConversationTranscript>> {
    if (!isConversationId(id)) return { ok: false, reason: 'Malformed conversation id.' };

    const list = await this.readIndex();
    const summary = list.find((entry) => entry.id === id);
    if (!summary) return { ok: false, reason: 'No such conversation.' };

    let text: string;
    try {
      text = await readFile(this.transcriptPath(id), 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return { ok: true, value: { summary, messages: [], incomplete: false } };
      }
      return { ok: false, reason: `Transcript unreadable (${code}).` };
    }

    const messages: PersistedMessage[] = [];
    let incomplete = false;

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // A torn final line from an interrupted append, or a line from a format
        // we do not understand. Skipped and reported — never reconstructed.
        incomplete = true;
        continue;
      }
      const message = readMessage(parsed);
      if (!message) {
        incomplete = true;
        continue;
      }
      messages.push(message);
    }

    return { ok: true, value: { summary, messages, incomplete } };
  }

  /* ---------------------------------------------------------------- mutations */

  /**
   * Start a conversation.
   *
   * `sessionId` is normally null: the engine session does not exist until the
   * first turn, and minting a handle here would invent one.
   */
  async create(
    workspacePath: string,
    options: {
      sessionId?: string | null;
      mode?: ConversationMode;
      /**
       * Title to use instead of the placeholder.
       *
       * Supplied for a single-agent chat, which is named for its executive rather
       * than for the founder's first question. A conversation carrying a real
       * title never has one adopted over it — see `append`.
       */
      title?: string;
    } = {}
  ): Promise<ConversationResult<ConversationSummary>> {
    if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
      return { ok: false, reason: 'A workspace path is required.' };
    }

    const given = (options.title ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH);

    return this.serialise(async () => {
      const now = Date.now();
      const summary: ConversationSummary = {
        id: randomUUID(),
        sessionId: options.sessionId ?? null,
        workspacePath,
        // The placeholder is replaced by the founder's own words on the first
        // stored message; a supplied title is kept.
        title: given.length > 0 ? given : NEW_CONVERSATION_TITLE,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        mode: readConversationMode(options.mode),
      };
      await this.writeIndex([summary, ...(await this.readIndex())]);
      return { ok: true, value: summary };
    });
  }

  /**
   * Append settled messages.
   *
   * The body is appended first and the index second. If the process dies between
   * them, the next load reads a transcript slightly longer than its recorded
   * count — messages present but undercounted. The opposite order would claim
   * messages that were never written, and losing a founder's words is worse than
   * miscounting them.
   */
  async append(
    id: string,
    messages: readonly PersistedMessage[]
  ): Promise<ConversationResult<ConversationSummary>> {
    if (!isConversationId(id)) return { ok: false, reason: 'Malformed conversation id.' };
    if (messages.length === 0) return { ok: false, reason: 'Nothing to append.' };

    return this.serialise(async () => {
      const list = await this.readIndex();
      const existing = list.find((entry) => entry.id === id);
      if (!existing) return { ok: false, reason: 'No such conversation.' };

      await this.ensureRoot();

      const payload = messages
        .map((message) => {
          const line: StoredLine = { v: CONVERSATION_SCHEMA_VERSION, message };
          return JSON.stringify(line);
        })
        .join('\n');

      await appendFile(this.transcriptPath(id), `${payload}\n`, 'utf8');

      /*
       * The title is adopted from the founder's first stored message and then left
       * alone — a conversation should not rename itself as it grows.
       *
       * Only the placeholder is replaced. A single-agent chat is created already
       * named for its executive, and overwriting that with the founder's opening
       * sentence would remove the one label distinguishing it from a Council
       * conversation in the sidebar.
       */
      const firstUser = messages.find((message) => message.role === 'user');
      const adoptTitle =
        existing.messageCount === 0 &&
        existing.title === NEW_CONVERSATION_TITLE &&
        firstUser !== undefined
          ? deriveTitle(firstUser.text)
          : existing.title;

      return this.patch(id, (entry) => ({
        ...entry,
        title: adoptTitle,
        messageCount: entry.messageCount + messages.length,
        updatedAt: Date.now(),
      }));
    });
  }

  /**
   * Record the engine session handle for this conversation.
   *
   * Idempotent: re-binding the same handle touches nothing, so the renderer can
   * call it on every turn without rewriting the index each time.
   */
  async bindSession(
    id: string,
    sessionId: string
  ): Promise<ConversationResult<ConversationSummary>> {
    if (!isConversationId(id)) return { ok: false, reason: 'Malformed conversation id.' };
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return { ok: false, reason: 'A session id is required.' };
    }

    return this.serialise(async () => {
      const list = await this.readIndex();
      const existing = list.find((entry) => entry.id === id);
      if (!existing) return { ok: false, reason: 'No such conversation.' };
      if (existing.sessionId === sessionId) return { ok: true, value: existing };
      return this.patch(id, (entry) => ({ ...entry, sessionId }));
    });
  }

  /** Rename. The founder's words replace the founder's words; nothing is generated. */
  async rename(id: string, title: string): Promise<ConversationResult<ConversationSummary>> {
    if (!isConversationId(id)) return { ok: false, reason: 'Malformed conversation id.' };
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH);
    if (!clean) return { ok: false, reason: 'A title cannot be empty.' };
    return this.serialise(() => this.patch(id, (entry) => ({ ...entry, title: clean })));
  }

  /**
   * Delete a conversation and its transcript.
   *
   * The engine's own session history is deliberately left alone. This module did
   * not create it, does not own it, and reaching into another application's
   * storage to delete records would exceed anything the founder asked for.
   */
  async remove(id: string): Promise<ConversationResult<{ id: string }>> {
    if (!isConversationId(id)) return { ok: false, reason: 'Malformed conversation id.' };

    return this.serialise(async () => {
      const list = await this.readIndex();
      if (!list.some((entry) => entry.id === id)) {
        return { ok: false, reason: 'No such conversation.' };
      }
      // Index first: an orphaned body file is invisible, whereas an index entry
      // pointing at a deleted body would surface as a broken conversation.
      await this.writeIndex(list.filter((entry) => entry.id !== id));
      await rm(this.transcriptPath(id), { force: true });
      return { ok: true, value: { id } };
    });
  }
}
