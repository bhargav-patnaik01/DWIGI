/**
 * The read-only Tool Adapter — provider-agnostic tool definitions for the
 * fixed, non-mutating capability set a Hosted engine may call.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DUPLICATES `runtime/tools/*.json` INSTEAD OF READING IT
 * ---------------------------------------------------------------------------
 * `runtime/tools/*.json` (repo root) is the reasoning engine's own
 * documentation of its tool surface — read by CLAUDE.md's skills, meant for a
 * human or a Native engine to read as prose-adjacent spec. This file is the
 * GUI's *executable* schema: what actually gets serialised into an OpenAI-shaped
 * `tools` array and sent over HTTP. `shared/` is pure (no filesystem, no
 * process access — see `contract.ts`'s header) and is bundled separately from
 * the engine root, so reading the JSON files at runtime is not an option here.
 *
 * The two are kept in the same shape deliberately — same six names, same
 * argument names, same read-only framing — and `tests/hosted-tools.test.mjs`
 * asserts the six generic names below appear in both places, so a rename in
 * one is caught rather than silently drifting from the other.
 *
 * `read_business_memory` and `read_imported_context` have no `runtime/tools/`
 * counterpart on purpose: they are D.W.I.G.I-domain concepts (Business
 * Memory's schema, the imported-context store), not generic repository
 * primitives, so they belong only in this GUI-side adapter.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THIS "READ-ONLY" MORE THAN A LABEL
 * ---------------------------------------------------------------------------
 * Every tool here has no parameter that could name a destination to write, no
 * parameter that selects a delete, and no parameter that assembles a shell
 * command. The executor behind these (`electron/runtime/tools/execute.ts`)
 * imports no write/delete/spawn primitive at all — the same discipline
 * `electron/repo/index.ts` uses for the cockpit's own repository reads. A tool
 * that needed a ninth argument to stay read-only would be the wrong tool to add
 * here; it belongs in the v1.4 Runtime SDK the user's own answer reserves for
 * mutating operations.
 */

export const READ_ONLY_TOOL_NAMES = [
  'read_file',
  'list_directory',
  'search_workspace',
  'git_status',
  'git_diff',
  'git_log',
  'read_business_memory',
  'read_imported_context',
] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

export function isReadOnlyToolName(value: unknown): value is ReadOnlyToolName {
  return typeof value === 'string' && (READ_ONLY_TOOL_NAMES as readonly string[]).includes(value);
}

/** A minimal JSON Schema object — just enough to describe tool parameters. */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<
    string,
    { type: 'string' | 'boolean' | 'integer'; description: string; default?: unknown }
  >;
  required?: readonly string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: ReadOnlyToolName;
  /** Shown to the model verbatim as the function's description. */
  description: string;
  parameters: ToolParameterSchema;
}

/**
 * The eight tool definitions, in the order a founder would reasonably reach
 * for them: read a file, look around, search, check git, then the two
 * D.W.I.G.I-specific reads.
 */
export const READ_ONLY_TOOLS: Readonly<Record<ReadOnlyToolName, ToolDefinition>> = {
  read_file: {
    name: 'read_file',
    description:
      'Read one text file from the workspace, by path relative to the workspace root. Read-only — cannot write, create, or delete.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path.' },
        max_bytes: {
          type: 'integer',
          description: 'Upper bound on bytes returned. A larger file is truncated and reported as such.',
          default: 200000,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  list_directory: {
    name: 'list_directory',
    description:
      'List the immediate contents of one workspace directory, by path relative to the workspace root. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative directory path.', default: '.' },
      },
      additionalProperties: false,
    },
  },
  search_workspace: {
    name: 'search_workspace',
    description:
      'Search file contents across the workspace by regular expression. Read-only; binary files are skipped.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'Directory to scope the search to.', default: '.' },
        max_results: { type: 'integer', description: 'Upper bound on matches returned.', default: 200 },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  git_status: {
    name: 'git_status',
    description:
      'Read-only snapshot of the working tree: current branch, staged, unstaged, and untracked files.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Directory to run the status check from.', default: '.' },
      },
      additionalProperties: false,
    },
  },
  git_diff: {
    name: 'git_diff',
    description:
      'Read-only diff of what has changed, working tree against the index by default. Never applies, stages, or reverts anything.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Directory to run the diff from.', default: '.' },
        staged: {
          type: 'boolean',
          description: 'Diff the index against the last commit instead of the working tree against the index.',
          default: false,
        },
        path: { type: 'string', description: 'Limit the diff to one file or directory.' },
      },
      additionalProperties: false,
    },
  },
  git_log: {
    name: 'git_log',
    description: 'Read-only commit history: hash, author, date, and message, newest first.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Directory to run the log from.', default: '.' },
        path: { type: 'string', description: 'Limit history to commits touching this path.' },
        max_entries: { type: 'integer', description: 'Upper bound on commits returned.', default: 30 },
      },
      additionalProperties: false,
    },
  },
  read_business_memory: {
    name: 'read_business_memory',
    description:
      "Read the founder's Business Memory (core/business_memory.md) as it currently exists. Read-only — this tool cannot propose or write an update.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  read_imported_context: {
    name: 'read_imported_context',
    description:
      'List or read documents the founder has imported as Business Context (.dwigi/imported-context/). Read-only.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Imported document filename to read. Omit to list every imported document instead.',
        },
      },
      additionalProperties: false,
    },
  },
};

/** Compile every read-only tool to the OpenAI-compatible `tools` array shape. */
export function toOpenAIToolSpecs(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: ToolParameterSchema };
}> {
  return READ_ONLY_TOOL_NAMES.map((name) => {
    const tool = READ_ONLY_TOOLS[name];
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  });
}
