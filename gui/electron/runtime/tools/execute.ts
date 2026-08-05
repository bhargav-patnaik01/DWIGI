/**
 * Read-only tool executor — the only code path that turns a Hosted engine's
 * structured tool call into a real read against the workspace.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY CANNOT DO
 * ---------------------------------------------------------------------------
 * It imports no write, delete, rename, mkdir, or spawn-a-shell primitive —
 * only `readFile`, `readdir`, `stat`, and `execFile('git', [...])` with a
 * fixed, closed argument list per call. There is no code path here that
 * could be reached with a mutating verb, regardless of what a model asks for:
 * a hosted engine cannot request `git commit` because nothing in
 * `executeReadOnlyTool`'s switch ever assembles a `git` invocation from a
 * caller-supplied verb, only from the eight fixed tool names in
 * `shared/runtime/tools.ts`.
 *
 * Every path argument is resolved through `resolveInside()` before it touches
 * the filesystem, refusing anything that would land outside the workspace
 * root — the same guard `electron/repo/index.ts`'s `RepositoryReader` uses for
 * the cockpit's own reads, generalised here to accept any workspace-relative
 * path rather than the cockpit's fixed list of known files.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY RESULT IS `{ ok, content }` RATHER THAN A THROW
 * ---------------------------------------------------------------------------
 * A tool call answers into an OpenAI-shaped `tool` message, which is text. An
 * exception crossing this boundary would either kill the whole turn over one
 * bad path, or (worse) get stringified into the model's context with a stack
 * trace. Every failure — outside the workspace, not a git repo, file missing —
 * is a first-class, honestly worded result the model reads and can react to,
 * not a crash.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ReadOnlyToolName } from '../../../shared/runtime/tools';

const execFileAsync = promisify(execFile);

/** Directories never walked by `search_workspace` — noise, not signal, and often huge. */
const SEARCH_EXCLUDES = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', 'out']);

export interface ToolExecutionContext {
  /** Absolute path to the workspace root. Never crossed by any resolved path below. */
  workspacePath: string;
}

export interface ToolCallResult {
  ok: boolean;
  /** JSON-stringified payload (success or error), sent back as the tool message's content. */
  content: string;
}

function success(value: unknown): ToolCallResult {
  return { ok: true, content: JSON.stringify(value) };
}

function failure(code: string, message: string): ToolCallResult {
  return { ok: false, content: JSON.stringify({ error: code, message }) };
}

/** Resolve a workspace-relative path, refusing anything outside the workspace root. */
function resolveInside(workspacePath: string, relative: string | undefined): string | null {
  const root = path.resolve(workspacePath);
  const resolved = path.resolve(root, relative && relative.length > 0 ? relative : '.');
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function asString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key];
  return typeof value === 'boolean' ? value : fallback;
}

function asInteger(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

/* -------------------------------------------------------------------------- */
/* read_file                                                                  */
/* -------------------------------------------------------------------------- */

async function readFileTool(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolCallResult> {
  const relative = asString(args, 'path');
  if (!relative) return failure('invalid_arguments', '`path` is required.');
  const target = resolveInside(ctx.workspacePath, relative);
  if (!target) return failure('outside_workspace', '`path` resolves outside the workspace and was refused.');

  const maxBytes = asInteger(args, 'max_bytes', 200_000);
  try {
    const info = await stat(target);
    if (!info.isFile()) return failure('not_a_file', '`path` is not a file.');
    const buffer = await readFile(target);
    const truncated = buffer.length > maxBytes;
    const text = buffer.subarray(0, maxBytes).toString('utf8');
    return success({ content: text, truncated, byte_length: buffer.length });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return failure('not_found', code === 'ENOENT' ? 'File does not exist.' : `Unreadable (${code}).`);
  }
}

/* -------------------------------------------------------------------------- */
/* list_directory                                                             */
/* -------------------------------------------------------------------------- */

async function listDirectoryTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const relative = asString(args, 'path') ?? '.';
  const target = resolveInside(ctx.workspacePath, relative);
  if (!target) return failure('outside_workspace', '`path` resolves outside the workspace and was refused.');

  try {
    const entries = await readdir(target, { withFileTypes: true });
    return success({
      entries: entries
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return failure(
      'not_found',
      code === 'ENOENT' ? 'Directory does not exist.' : `Unreadable (${code}).`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* search_workspace                                                           */
/* -------------------------------------------------------------------------- */

async function walk(dir: string, out: string[], limit: number): Promise<void> {
  if (out.length >= limit) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= limit) return;
    if (SEARCH_EXCLUDES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out, limit);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

async function searchWorkspaceTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const pattern = asString(args, 'pattern');
  if (!pattern) return failure('invalid_arguments', '`pattern` is required.');

  const relative = asString(args, 'path') ?? '.';
  const scope = resolveInside(ctx.workspacePath, relative);
  if (!scope) return failure('outside_workspace', '`path` resolves outside the workspace and was refused.');

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return failure('invalid_pattern', '`pattern` is not a valid regular expression.');
  }

  const maxResults = asInteger(args, 'max_results', 200);
  // Bounded well above maxResults so a search that will be truncated anyway does
  // not walk the entire tree first — a search-time cap, not a results-time one.
  const files: string[] = [];
  await walk(scope, files, Math.max(maxResults * 20, 2000));

  const matches: Array<{ file: string; line: number; text: string }> = [];
  let filesSearched = 0;

  for (const file of files) {
    if (matches.length >= maxResults) break;
    let buffer: Buffer;
    try {
      buffer = await readFile(file);
    } catch {
      continue;
    }
    // Binary files are skipped, not scanned byte-for-byte — a null byte in the
    // first kilobyte is the same cheap heuristic used elsewhere in this codebase.
    if (buffer.subarray(0, 1024).includes(0)) continue;
    filesSearched += 1;
    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length && matches.length < maxResults; i += 1) {
      const lineText = lines[i] ?? '';
      if (regex.test(lineText)) {
        matches.push({
          file: path.relative(ctx.workspacePath, file).split(path.sep).join('/'),
          line: i + 1,
          text: lineText,
        });
      }
    }
  }

  return success({ matches, truncated: matches.length >= maxResults, files_searched: filesSearched });
}

/* -------------------------------------------------------------------------- */
/* git tools                                                                  */
/* -------------------------------------------------------------------------- */

async function runGit(cwd: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 15_000, maxBuffer: 10_000_000 });
    return { ok: true, stdout };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'git failed.';
    return { ok: false, message };
  }
}

async function gitCwd(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<string | null> {
  const relative = asString(args, 'cwd') ?? '.';
  return resolveInside(ctx.workspacePath, relative);
}

async function gitStatusTool(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolCallResult> {
  const cwd = await gitCwd(ctx, args);
  if (!cwd) return failure('outside_workspace', '`cwd` resolves outside the workspace and was refused.');

  const result = await runGit(cwd, ['status', '--porcelain=v1', '--branch']);
  if (!result.ok) return failure('not_a_repository', '`cwd` does not resolve inside a git repository.');

  const lines = result.stdout.split('\n').filter((l) => l.length > 0);
  const branchLine = lines.find((l) => l.startsWith('## ')) ?? '## HEAD';
  const branch = (branchLine.slice(3).split('...')[0] ?? branchLine.slice(3)).trim();

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) continue;
    const indexState = line[0];
    const workTreeState = line[1];
    const file = line.slice(3);
    if (indexState === '?' && workTreeState === '?') {
      untracked.push(file);
    } else {
      if (indexState !== ' ') staged.push(file);
      if (workTreeState !== ' ') unstaged.push(file);
    }
  }

  return success({
    branch,
    staged,
    unstaged,
    untracked,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  });
}

async function gitDiffTool(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolCallResult> {
  const cwd = await gitCwd(ctx, args);
  if (!cwd) return failure('outside_workspace', '`cwd` resolves outside the workspace and was refused.');

  const staged = asBoolean(args, 'staged', false);
  const maxBytes = asInteger(args, 'max_bytes', 100_000);
  const relPath = asString(args, 'path');

  const gitArgs = ['diff', '--numstat'];
  if (staged) gitArgs.push('--cached');
  if (relPath) gitArgs.push('--', relPath);
  const numstat = await runGit(cwd, gitArgs);
  if (!numstat.ok) return failure('not_a_repository', '`cwd` does not resolve inside a git repository.');
  const filesChanged = numstat.stdout.split('\n').filter((l) => l.trim().length > 0).length;

  const diffArgs = ['diff'];
  if (staged) diffArgs.push('--cached');
  if (relPath) diffArgs.push('--', relPath);
  const diff = await runGit(cwd, diffArgs);
  if (!diff.ok) return failure('not_a_repository', '`cwd` does not resolve inside a git repository.');

  const truncated = diff.stdout.length > maxBytes;
  return success({
    diff: diff.stdout.slice(0, maxBytes),
    truncated,
    files_changed: filesChanged,
  });
}

async function gitLogTool(ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolCallResult> {
  const cwd = await gitCwd(ctx, args);
  if (!cwd) return failure('outside_workspace', '`cwd` resolves outside the workspace and was refused.');

  const maxEntries = asInteger(args, 'max_entries', 30);
  const relPath = asString(args, 'path');

  const gitArgs = ['log', `-n${maxEntries + 1}`, '--pretty=format:%h%x1f%an%x1f%aI%x1f%s%x1e'];
  if (relPath) gitArgs.push('--', relPath);
  const result = await runGit(cwd, gitArgs);
  if (!result.ok) return failure('not_a_repository', '`cwd` does not resolve inside a git repository.');

  const entries = result.stdout.split('\x1e').map((s) => s.trim()).filter((s) => s.length > 0);
  if (entries.length === 0) return failure('no_commits', 'The repository has no commits yet.');

  const commits = entries.slice(0, maxEntries).map((entry) => {
    const [hash, author, date, message] = entry.split('\x1f');
    return { hash, author, date, message };
  });

  return success({ commits, truncated: entries.length > maxEntries });
}

/* -------------------------------------------------------------------------- */
/* D.W.I.G.I-domain tools                                                     */
/* -------------------------------------------------------------------------- */

async function readBusinessMemoryTool(ctx: ToolExecutionContext): Promise<ToolCallResult> {
  const target = resolveInside(ctx.workspacePath, path.join('core', 'business_memory.md'));
  if (!target) return failure('outside_workspace', 'Business Memory path resolves outside the workspace.');
  try {
    const content = await readFile(target, 'utf8');
    return success({ content });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return failure(
      'not_found',
      code === 'ENOENT'
        ? 'Business Memory does not exist yet for this workspace.'
        : `Unreadable (${code}).`
    );
  }
}

const IMPORTED_CONTEXT_DIR = path.join('.dwigi', 'imported-context');

async function readImportedContextTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const dir = resolveInside(ctx.workspacePath, IMPORTED_CONTEXT_DIR);
  if (!dir) return failure('outside_workspace', 'Imported-context path resolves outside the workspace.');

  const name = asString(args, 'name');
  if (!name) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return success({ documents: entries.filter((e) => e.isFile()).map((e) => e.name).sort() });
    } catch {
      return success({ documents: [] });
    }
  }

  // `name` is a bare filename inside a fixed cockpit-owned directory, never a
  // path — stripped to its basename so it cannot be used to climb out.
  const target = resolveInside(ctx.workspacePath, path.join(IMPORTED_CONTEXT_DIR, path.basename(name)));
  if (!target) return failure('outside_workspace', '`name` resolves outside the imported-context directory.');
  try {
    const content = await readFile(target, 'utf8');
    return success({ content });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return failure(
      'not_found',
      code === 'ENOENT' ? 'No imported document with that name.' : `Unreadable (${code}).`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Execute one read-only tool call.
 *
 * `name` is typed to the closed vocabulary, but a caller crossing an IPC-free
 * in-process boundary can still pass an unrecognised string from a malformed
 * model response — handled as a first-class failure, not a crash, for the same
 * reason every branch below returns rather than throws.
 */
export async function executeReadOnlyTool(
  name: string,
  rawArguments: unknown,
  ctx: ToolExecutionContext
): Promise<ToolCallResult> {
  const args =
    typeof rawArguments === 'object' && rawArguments !== null
      ? (rawArguments as Record<string, unknown>)
      : {};

  try {
    switch (name as ReadOnlyToolName) {
      case 'read_file':
        return await readFileTool(ctx, args);
      case 'list_directory':
        return await listDirectoryTool(ctx, args);
      case 'search_workspace':
        return await searchWorkspaceTool(ctx, args);
      case 'git_status':
        return await gitStatusTool(ctx, args);
      case 'git_diff':
        return await gitDiffTool(ctx, args);
      case 'git_log':
        return await gitLogTool(ctx, args);
      case 'read_business_memory':
        return await readBusinessMemoryTool(ctx);
      case 'read_imported_context':
        return await readImportedContextTool(ctx, args);
      default:
        return failure('unknown_tool', `"${name}" is not a recognised read-only tool.`);
    }
  } catch (error) {
    return failure('execution_failed', error instanceof Error ? error.message : 'Tool execution failed.');
  }
}
