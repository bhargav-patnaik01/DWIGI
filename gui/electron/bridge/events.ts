/**
 * Wire-format translation: Claude Code NDJSON → vendor-neutral AdvisorEvent.
 *
 * ALL PARSING LIVES HERE. The renderer receives only `AdvisorEvent` and must
 * never inspect a raw runtime shape. That division is what allows the reducer to
 * be a pure buffer with no interpretation in it.
 *
 * Event vocabulary was established empirically against CLI 2.1.220 rather than
 * from documentation. Observed shapes:
 *
 *   system/init                          session start, tool list
 *   system/status                        progress chatter
 *   rate_limit_event                     utilisation notice
 *   stream_event/content_block_delta     token stream  (text_delta)
 *   assistant                            complete message; may hold tool_use
 *   user                                 tool_result (including refusals)
 *   control_request/can_use_tool         BLOCKING consent request  (see below)
 *   {is_error, num_turns, ...}           terminal result
 *
 * Anything unrecognised is ignored rather than guessed at. Inventing meaning for
 * an unknown shape is precisely the fabrication the contract forbids.
 *
 * ---------------------------------------------------------------------------
 * THE ONE SHAPE THAT MUST NEVER BE SILENTLY IGNORED
 * ---------------------------------------------------------------------------
 * `control_request` is the exception to "ignore what you do not understand".
 * The runtime is *blocked* on every control request until it receives a
 * matching `control_response`. Dropping one does not lose a display detail; it
 * wedges the engine forever.
 *
 * So this parser reports every control request it sees, including subtypes it
 * has no meaning for, via `onControlRequest`. Deciding what to answer is the
 * transport's job — see `claude-cli.ts` — but *noticing* is this file's, and it
 * must notice unconditionally.
 */

import { randomUUID } from 'node:crypto';
import type { ActivityEvent, AdvisorEvent } from '../../shared/advisor';
import { CONTROL } from './permission-policy';

export interface ParserState {
  /** Index of the content block currently carrying assistant text. */
  textIndex: number | null;
}

/** A control request the runtime is blocked on, as seen on the wire. */
export interface ControlRequestSighting {
  /** Runtime correlation token. Must be echoed back verbatim. */
  requestId: string;
  /** Discriminator, e.g. `can_use_tool`. Empty when the runtime omitted it. */
  subtype: string;
  /** True when this parser produced a `permission-request` for it. */
  understood: boolean;
  /** Tool call the request refers to, when it names one. */
  toolUseId: string | null;
}

interface Context {
  turnId: string;
  state: ParserState;
  /**
   * Called for EVERY control request observed, understood or not.
   *
   * The transport uses this to track what the engine is blocked on and to
   * guarantee that something is eventually answered. A parser that returned
   * events but never called this would let an unrecognised subtype hang the
   * runtime silently.
   */
  onControlRequest(sighting: ControlRequestSighting): void;
  /**
   * True when this cockpit itself answered the named tool call.
   *
   * Used to suppress a duplicate `permission-denied` notice for a refusal the
   * user already saw and made. Denials the runtime issued on its own authority
   * are not adjudicated and still surface.
   */
  wasAdjudicated(toolUseId: string): boolean;
}

/** Presentational bucket for a tool name. Not a reasoning classification. */
function categorise(tool: string): ActivityEvent['category'] {
  switch (tool) {
    case 'Read':
    case 'NotebookRead':
      return 'read';
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return 'write';
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
    case 'WebFetch':
      return 'search';
    case 'Bash':
    case 'Task':
      return 'run';
    default:
      return 'other';
  }
}

/**
 * Human-readable label for a tool call.
 *
 * Derived strictly from what the runtime reported. It names the file being read
 * or the pattern being searched — it never characterises why, because the
 * runtime does not say why and the cockpit must not invent a reason.
 */
function describeTool(tool: string, input: Record<string, unknown>): string {
  const base = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const parts = value.split(/[\\/]/);
    return parts[parts.length - 1] ?? value;
  };

  switch (tool) {
    case 'Read':
      return `Reading ${base(input.file_path) || 'file'}`;
    case 'Write':
      return `Writing ${base(input.file_path) || 'file'}`;
    case 'Edit':
      return `Editing ${base(input.file_path) || 'file'}`;
    case 'Glob':
      return `Finding ${String(input.pattern ?? 'files')}`;
    case 'Grep':
      return `Searching for ${String(input.pattern ?? '')}`.trim();
    case 'Bash':
      return `Running ${String(input.description ?? 'command')}`;
    case 'Task':
      return `Delegating ${String(input.description ?? 'task')}`;
    case 'TodoWrite':
      return 'Updating task list';
    default:
      return tool;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Targets a pending tool call would affect, read from the engine's own input.
 *
 * Structured fields only. The v1 code recovered paths by running a regex over
 * the refusal *prose*, because a refusal message was all it had; a live request
 * carries the actual arguments, so guessing is no longer necessary and would
 * now be a downgrade.
 */
function targetsFromInput(tool: string, input: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  };

  push(input.file_path);
  push(input.path);
  push(input.notebook_path);
  if (Array.isArray(input.edits)) {
    for (const edit of input.edits) if (isRecord(edit)) push(edit.file_path);
  }
  if (tool === 'Bash') push(input.command);
  if (tool === 'WebFetch') push(input.url);

  return [...new Set(out)].slice(0, 4);
}

/**
 * Extra detail worth showing for a pending call, beyond the one-line summary.
 *
 * Deliberately narrow. This is shown to someone deciding whether to authorise
 * an action, so it carries what changes that decision — the command that would
 * run, the bytes that would be written — and nothing else.
 */
function detailFromInput(tool: string, input: Record<string, unknown>): string | undefined {
  const clamp = (value: unknown, limit: number): string | undefined => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return value.length > limit ? `${value.slice(0, limit)}…` : value;
  };

  switch (tool) {
    case 'Bash':
      return clamp(input.command, 800);
    case 'Write':
      return clamp(input.content, 800);
    case 'Edit':
      return clamp(input.new_string, 800);
    default:
      return undefined;
  }
}

export function toAdvisorEvents(
  raw: unknown,
  ctx: Context
): { events: AdvisorEvent[]; lastKind: string | null } {
  const events: AdvisorEvent[] = [];
  if (!isRecord(raw)) return { events, lastKind: null };

  const type = typeof raw.type === 'string' ? raw.type : undefined;
  const subtype = typeof raw.subtype === 'string' ? raw.subtype : undefined;
  const kind = type === 'stream_event' && isRecord(raw.event) && typeof raw.event.type === 'string'
    ? `stream_event/${raw.event.type}`
    : subtype
      ? `${type}/${subtype}`
      : (type ?? 'result');

  /*
   * ------------------------------------------------- blocking control request
   * The engine is stopped until this is answered. Reported to the transport
   * unconditionally, before any attempt to understand it, so that an unknown
   * subtype still gets a reply rather than hanging the runtime.
   */
  if (type === CONTROL.request) {
    const request = isRecord(raw.request) ? raw.request : {};
    const requestId = typeof raw.request_id === 'string' ? raw.request_id : '';
    const requestSubtype = typeof request.subtype === 'string' ? request.subtype : '';
    const toolUseId = typeof request.tool_use_id === 'string' ? request.tool_use_id : null;

    /*
     * A control request without a correlation token cannot be answered — there
     * is nothing to address the reply to. Report it so the transport can say so
     * out loud, and produce no permission event, because asking the founder to
     * decide something whose answer goes nowhere would be worse than useless.
     */
    const tool = typeof request.tool_name === 'string' ? request.tool_name : '';
    const understood =
      requestSubtype === CONTROL.canUseTool && requestId !== '' && tool !== '';

    ctx.onControlRequest({ requestId, subtype: requestSubtype, understood, toolUseId });

    if (understood) {
      const input = isRecord(request.input) ? request.input : {};
      // `description` is the runtime's own display copy when it supplies one;
      // `describeTool` is our fallback, and is derived from the same arguments.
      const summary =
        typeof request.description === 'string' && request.description.trim()
          ? request.description.trim()
          : describeTool(tool, input);

      const detail = detailFromInput(tool, input);

      events.push({
        kind: 'permission-request',
        turnId: ctx.turnId,
        requestId,
        tool,
        summary,
        targets: targetsFromInput(tool, input),
        category: categorise(tool),
        ...(detail ? { detail } : {}),
      });
    }

    return { events, lastKind: requestSubtype ? `${type}/${requestSubtype}` : type };
  }

  /*
   * ------------------------------------------------------------ terminal result
   * Observed as `{"type":"result","subtype":"success", is_error, ...}`. The `type`
   * field sits late in the object, so an early truncated read makes it look
   * absent — which is exactly the mistake this branch originally made, leaving
   * every turn formally unfinished and the UI spinner running forever.
   * Both shapes are accepted now.
   */
  if ((type === 'result' || type === undefined) && typeof raw.is_error === 'boolean') {
    if (raw.is_error) {
      events.push({
        kind: 'error',
        turnId: ctx.turnId,
        message:
          typeof raw.result === 'string' ? raw.result : 'The runtime reported a failure.',
        fatal: false,
      });
    }
    events.push({
      kind: 'turn-complete',
      turnId: ctx.turnId,
      stats: {
        durationMs: typeof raw.duration_api_ms === 'number' ? raw.duration_api_ms : undefined,
        costUsd: typeof raw.total_cost_usd === 'number' ? raw.total_cost_usd : undefined,
        turns: typeof raw.num_turns === 'number' ? raw.num_turns : undefined,
      },
    });
    ctx.state.textIndex = null;
    return { events, lastKind: kind };
  }

  /* -------------------------------------------------------------- token stream */
  if (type === 'stream_event' && isRecord(raw.event)) {
    const inner = raw.event;
    const innerType = typeof inner.type === 'string' ? inner.type : '';

    if (innerType === 'content_block_start' && isRecord(inner.content_block)) {
      if (inner.content_block.type === 'text' && typeof inner.index === 'number') {
        ctx.state.textIndex = inner.index;
      }
      return { events, lastKind: kind };
    }

    if (innerType === 'content_block_delta' && isRecord(inner.delta)) {
      const delta = inner.delta;
      // Only text deltas surface. Thinking blocks are deliberately not shown:
      // the advisor's contract is that it never narrates its own machinery.
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        if (ctx.state.textIndex === null || inner.index === ctx.state.textIndex) {
          events.push({ kind: 'text-delta', turnId: ctx.turnId, text: delta.text });
        }
      }
      return { events, lastKind: kind };
    }

    if (innerType === 'content_block_stop') {
      ctx.state.textIndex = null;
    }
    return { events, lastKind: kind };
  }

  /* --------------------------------------------- complete assistant / tool_use */
  if (type === 'assistant' && isRecord(raw.message)) {
    const content = Array.isArray(raw.message.content) ? raw.message.content : [];
    const text = content
      .filter((b): b is Record<string, unknown> => isRecord(b) && b.type === 'text')
      .map((b) => (typeof b.text === 'string' ? b.text : ''))
      .join('');

    if (text) {
      events.push({ kind: 'message-complete', turnId: ctx.turnId, text });
    }

    for (const block of content) {
      if (!isRecord(block) || block.type !== 'tool_use') continue;
      const tool = typeof block.name === 'string' ? block.name : 'tool';
      const id = typeof block.id === 'string' ? block.id : randomUUID();
      const input = isRecord(block.input) ? block.input : {};
      events.push({
        kind: 'activity',
        turnId: ctx.turnId,
        activityId: id,
        label: describeTool(tool, input),
        category: categorise(tool),
        state: 'started',
      });
    }
    return { events, lastKind: kind };
  }

  /* ------------------------------------------- tool results, including refusals */
  if (type === 'user' && isRecord(raw.message)) {
    const content = Array.isArray(raw.message.content) ? raw.message.content : [];
    const meta = Array.isArray(raw.tool_result_meta) ? raw.tool_result_meta : [];

    for (const block of content) {
      if (!isRecord(block) || block.type !== 'tool_result') continue;
      const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : randomUUID();
      const failed = block.is_error === true;

      // A refusal is distinguishable from an ordinary failure only by this field.
      const refused = meta.some(
        (m) =>
          isRecord(m) &&
          m.id === id &&
          typeof m.non_execution_kind === 'string' &&
          m.non_execution_kind.includes('rejected')
      );

      events.push({
        kind: 'activity',
        turnId: ctx.turnId,
        activityId: id,
        label: '',
        category: 'other',
        state: failed ? 'failed' : 'completed',
      });

      /*
       * A refusal the founder was asked about and declined arrives here too,
       * as the tool result carrying their own message. Reporting it again as a
       * `permission-denied` notice would tell them twice about one decision —
       * once as the question they answered, once as news.
       *
       * So only refusals this cockpit never adjudicated surface: deny rules,
       * classifiers, sandbox policy. Those really are news.
       */
      if (refused && !ctx.wasAdjudicated(id)) {
        const summary =
          typeof block.content === 'string'
            ? block.content
            : typeof raw.tool_use_result === 'string'
              ? raw.tool_use_result
              : 'An action was refused for want of permission.';

        // The tool name is not repeated on the result. Recovered from the
        // message text as a best effort, and honest about being one — this path
        // now handles only engine-side denials, where nothing better is offered.
        const tool = /write to/i.test(summary)
          ? 'Write'
          : /edit/i.test(summary)
            ? 'Edit'
            : /run|execute|command/i.test(summary)
              ? 'Bash'
              : 'Write';

        events.push({
          kind: 'permission-denied',
          turnId: ctx.turnId,
          tool,
          summary: summary.replace(/^Error:\s*/, '').slice(0, 400),
          targets: extractPaths(summary),
          category: categorise(tool),
        });
      }
    }
    return { events, lastKind: kind };
  }

  /* ------------------------------------------------------------ rate limiting */
  if (type === 'rate_limit_event' && isRecord(raw.rate_limit_info)) {
    const info = raw.rate_limit_info;
    const status = typeof info.status === 'string' ? info.status : '';
    if (status && status !== 'allowed') {
      events.push({
        kind: 'runtime-notice',
        turnId: ctx.turnId,
        severity: status.includes('warning') ? 'warning' : 'info',
        message: `Rate limit: ${status.replace(/_/g, ' ')}.`,
      });
    }
    return { events, lastKind: kind };
  }

  // system/init, system/status and anything unknown: no user-visible meaning.
  return { events, lastKind: kind };
}

/** Pull filesystem-looking paths out of a runtime message, for display only. */
function extractPaths(text: string): string[] {
  const matches = text.match(/[A-Za-z]:\\[^\s,'"]+|\/[^\s,'"]{3,}/g);
  return matches ? [...new Set(matches)].slice(0, 4) : [];
}
