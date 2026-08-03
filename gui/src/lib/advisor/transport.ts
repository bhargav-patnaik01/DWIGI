'use client';

import {
  TRANSPORT_VERSION,
  TransportNotImplementedError,
  type AdvisorDiagnostics,
  type AdvisorEvent,
  type AdvisorSessionOptions,
  type AdvisorTransport,
  type PermissionDecision,
} from '@shared/advisor';
import type { RuntimeMode } from '@shared/runtime-modes';
import { hasHost } from '@/lib/utils';

export type {
  AdvisorEvent,
  AdvisorSessionOptions,
  AdvisorTransport,
  PermissionDecision,
  RuntimeMode,
};

/**
 * IPC-backed transport.
 *
 * A thin adapter, not an implementation: every method forwards to the host, which
 * owns the runtime and all parsing. The only logic here is converting the host's
 * push channel into a subscription, because IPC cannot carry one.
 */
class IpcAdvisorTransport implements AdvisorTransport {
  readonly version = TRANSPORT_VERSION;

  private listeners = new Set<(event: AdvisorEvent) => void>();
  private detach: (() => void) | null = null;

  private get api() {
    const api = window.eis?.advisor;
    if (!api) throw new TransportNotImplementedError('advisor');
    return api;
  }

  isAvailable(): Promise<boolean> {
    return this.api.isAvailable();
  }

  open(options: AdvisorSessionOptions): Promise<{ sessionId: string }> {
    return this.api.open(options);
  }

  send(text: string, mode?: RuntimeMode): Promise<{ turnId: string }> {
    // Forwarded unchanged. No trimming, no normalisation, no templating — and no
    // composition here either: the host applies the mode in exactly one place.
    return this.api.send(text, mode);
  }

  respondToPermission(requestId: string, decision: PermissionDecision): Promise<void> {
    return this.api.respondToPermission(requestId, decision);
  }

  cancel(): Promise<void> {
    return this.api.cancel();
  }

  async close(): Promise<void> {
    await this.api.close();
    this.detach?.();
    this.detach = null;
    this.listeners.clear();
  }

  getDiagnostics(): Promise<AdvisorDiagnostics> {
    return this.api.getDiagnostics();
  }

  /**
   * Fan a single host channel out to many subscribers.
   *
   * One `onEvent` registration is held for the lifetime of the first subscriber
   * and released when the last one leaves, so remounting components cannot leak
   * IPC listeners.
   */
  subscribe(listener: (event: AdvisorEvent) => void): () => void {
    this.listeners.add(listener);

    this.detach ??= this.api.onEvent((event) => {
      for (const l of this.listeners) {
        try {
          l(event);
        } catch {
          // A throwing subscriber must not stop the others or kill the stream.
        }
      }
    });

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.detach?.();
        this.detach = null;
      }
    };
  }
}

/**
 * Fallback for the browser preview (`npm run dev:web`), where no host exists.
 *
 * Reports unavailable rather than throwing on construction, so the UI exercises
 * its disconnected state — which the real transport can also enter when the
 * runtime is missing or the workspace is unset.
 */
class NullAdvisorTransport implements AdvisorTransport {
  readonly version = TRANSPORT_VERSION;

  async isAvailable(): Promise<boolean> {
    return false;
  }
  async open(): Promise<{ sessionId: string }> {
    throw new TransportNotImplementedError('open');
  }
  async send(): Promise<{ turnId: string }> {
    throw new TransportNotImplementedError('send');
  }
  async respondToPermission(): Promise<void> {
    throw new TransportNotImplementedError('respondToPermission');
  }
  async cancel(): Promise<void> {}
  async close(): Promise<void> {}
  async getDiagnostics(): Promise<AdvisorDiagnostics> {
    return {
      transportVersion: TRANSPORT_VERSION,
      connected: false,
      sessionId: null,
      workspacePath: null,
      workingDirectory: null,
      runtimeVersion: null,
      processState: 'stopped',
      lastEventKind: null,
      pendingPermissionCount: 0,
    };
  }
  subscribe(): () => void {
    return () => {};
  }
}

let instance: AdvisorTransport | null = null;

/**
 * Resolve the active transport.
 *
 * The single place a concrete implementation is selected. Swapping to a Tauri or
 * SDK runtime means adding one branch here; nothing above this line changes.
 */
export function getAdvisorTransport(): AdvisorTransport {
  instance ??= hasHost() ? new IpcAdvisorTransport() : new NullAdvisorTransport();
  return instance;
}
