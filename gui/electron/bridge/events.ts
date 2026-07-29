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
 *   {is_error, num_turns, ...}           terminal result
 *
 * Anything unrecognised is ignored rather than guessed at. Inventing meaning for
 * an unknown shape is precisely the fabrication the contract forbids.
 */

import { randomUUID } from 'node:crypto';
import type { ActivityEvent, AdvisorEvent } from '../../shared/advisor';

export interface ParserState {
  /** Index of the content block currently carrying assistant text. */
  textIndex: number | null;
}

interface Context {
  turnId: string;
  state: ParserState;
  /** Lets the runtime remember which tool a refusal referred to. */
  registerGrant(requestId: string, tool: string): void;
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

      if (refused) {
        const summary =
          typeof block.content === 'string'
            ? block.content
            : typeof raw.tool_use_result === 'string'
              ? raw.tool_use_result
              : 'An action was refused for want of permission.';

        const requestId = randomUUID();
        // Tool name is not repeated on the result, so it is recovered from the
        // message text. Imperfect, and honest about being a best effort.
        const tool = /write to/i.test(summary)
          ? 'Write'
          : /edit/i.test(summary)
            ? 'Edit'
            : /run|execute|command/i.test(summary)
              ? 'Bash'
              : 'Write';

        ctx.registerGrant(requestId, tool);

        events.push({
          kind: 'permission-denied',
          turnId: ctx.turnId,
          requestId,
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
