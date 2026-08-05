/**
 * Provider discovery — is this runtime present on this machine?
 *
 * ---------------------------------------------------------------------------
 * ONE DETECTOR, DRIVEN BY DECLARED HINTS
 * ---------------------------------------------------------------------------
 * Every provider declares `DiscoveryHint`s as data. This file implements the hint
 * vocabulary once and knows no provider's name. A provider needing bespoke
 * detection logic would be a provider leaking into the platform — so if a future
 * runtime cannot be found by any hint kind here, the correct move is to add a
 * hint *kind* (and teach every provider about it), not a special case.
 *
 * ---------------------------------------------------------------------------
 * DISCOVERY NEVER AUTHENTICATES, AND NEVER CONNECTS
 * ---------------------------------------------------------------------------
 * ADR-013 §F rules 3 and 4: a detected provider is not a connected one, and
 * connection requires explicit consent. So detection may run a `--version` probe
 * and may open a TCP connection to *localhost*, and may do neither of the two
 * things that would violate consent:
 *
 *   - It does not send a credential anywhere.
 *   - It does not contact a remote host.
 *
 * That second rule is why a manifest's remote `httpProbe` is deliberately **not**
 * executed during discovery. An application that phoned api.openai.com on launch,
 * before the founder had connected anything, would be doing exactly what a
 * local-first tool promises not to do. Remote probes run only on an explicit
 * Test Connection, from `checkHealth`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import type { DiscoveryHint, RuntimeHealth } from '../../shared/runtime/contract';

const execFileAsync = promisify(execFile);

const IS_WINDOWS = process.platform === 'win32';

/** Version probes are cheap or they are broken. Nothing here may hang a launch. */
const PROBE_TIMEOUT_MS = 8_000;
const SOCKET_TIMEOUT_MS = 1_200;

/**
 * Windows resolves CLI tools installed by npm through a `.cmd` shim, and Node 20+
 * refuses to spawn `.cmd` without a shell (CVE-2024-27980 hardening). The existing
 * Claude transport documents this at length; discovery inherits the same
 * constraint and the same safety argument: every argument here is a literal flag
 * or a manifest-declared command name, and no user input reaches an argument list.
 */
function candidateCommands(command: string): string[] {
  return IS_WINDOWS ? [`${command}.cmd`, `${command}.exe`, command] : [command];
}

/** `~` is expanded here rather than in a manifest, so manifests stay pure data. */
function expandHome(target: string): string {
  if (target === '~') return homedir();
  if (target.startsWith('~/') || target.startsWith('~\\')) {
    return path.join(homedir(), target.slice(2));
  }
  return target;
}

function now(): number {
  return Date.now();
}

/**
 * Is a TCP port accepting connections?
 *
 * Used instead of an HTTP request for local services. A connect-and-close answers
 * "is something listening" without sending a byte of payload, which is all
 * discovery is entitled to know — and it cannot be mistaken for a request that
 * carried data.
 */
function probeSocket(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** A local URL's host and port, or null when the URL is remote or unparseable. */
function localTarget(url: string): { host: string; port: number } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  const isLocal =
    host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  if (!isLocal) return null;
  const port = Number.parseInt(parsed.port, 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { host: host === '[::1]' ? '::1' : host, port };
}

/**
 * Run every hint until one succeeds.
 *
 * ---------------------------------------------------------------------------
 * ABSENT IS A FIRST-CLASS ANSWER, NOT AN ERROR
 * ---------------------------------------------------------------------------
 * Most founders will have one runtime installed and four absent. `absent` is
 * therefore the expected outcome four times out of five, and it must be cheap,
 * quiet, and free of anything resembling a failure — a launch that logged four
 * errors because four optional tools were not installed would train everyone to
 * ignore the log.
 */
export async function discover(hints: readonly DiscoveryHint[]): Promise<RuntimeHealth> {
  if (hints.length === 0) {
    return {
      state: 'unknown',
      version: null,
      checkedAt: now(),
      message: 'This runtime cannot be detected automatically and must be connected manually.',
    };
  }

  let sawLocalService = false;

  for (const hint of hints) {
    /* -------------------------------------------------------------- command */
    if (hint.command) {
      const versionArg = hint.versionArg ?? '--version';
      for (const binary of candidateCommands(hint.command)) {
        const started = now();
        try {
          const { stdout } = await execFileAsync(binary, [versionArg], {
            shell: IS_WINDOWS,
            timeout: PROBE_TIMEOUT_MS,
            windowsHide: true,
          });
          const version = stdout.trim().split('\n')[0]?.trim() ?? null;
          return {
            state: 'healthy',
            version: version && version.length > 0 ? version : null,
            latencyMs: now() - started,
            checkedAt: now(),
          };
        } catch {
          // Not on PATH under this name. Try the next candidate, then the next hint.
        }
      }
    }

    /* ---------------------------------------------------------------- paths */
    if (hint.paths) {
      for (const candidate of hint.paths) {
        const target = expandHome(candidate);
        try {
          if ((await stat(target)).isFile()) {
            /*
             * Found on disk but not on PATH.
             *
             * `degraded`, not `healthy`: the file exists, and this build spawns
             * runtimes by command name rather than by absolute path, so a founder
             * in this state has an installation D.W.I.G.I can see and cannot yet
             * use. Reporting `healthy` would produce a runtime that detects fine
             * and fails on the first turn.
             */
            return {
              state: 'degraded',
              version: null,
              checkedAt: now(),
              message:
                'Found on this machine but not available on your PATH, so D.W.I.G.I cannot start it. ' +
                'Reopening your terminal after installation usually fixes this.',
            };
          }
        } catch {
          // Absent. Expected for every path but at most one.
        }
      }
    }

    /* ----------------------------------------------------------- http probe */
    if (hint.httpProbe) {
      const target = localTarget(hint.httpProbe.url);
      if (target) {
        const started = now();
        if (await probeSocket(target.host, target.port)) {
          return {
            state: 'healthy',
            version: null,
            latencyMs: now() - started,
            checkedAt: now(),
          };
        }
        sawLocalService = true;
      }
      // A remote probe is deliberately not run here. See the file header.
    }
  }

  if (sawLocalService) {
    return {
      state: 'absent',
      version: null,
      checkedAt: now(),
      message: 'Not running on this machine. Start it, then check again.',
    };
  }

  return {
    state: 'absent',
    version: null,
    checkedAt: now(),
    message: 'Not found on this machine.',
  };
}
