import type { HostBridge } from '@shared/host';

declare global {
  interface Window {
    /**
     * Host bridge, injected by the Electron preload via contextBridge.
     *
     * Optional by design: the renderer also runs in a plain browser during
     * `npm run dev:web`, where no host exists. Guard with `hasHost()` from
     * `@/lib/utils` rather than assuming presence.
     */
    eis?: HostBridge;
  }
}

export {};
