import { createVarcoConsumerClient, MemoryStorage, NobleRelayTransport, VarcoConnectionStrategy, consumerIdentityFromPrivateKey } from "@varco/client";
import type { VarcoConsumerClient } from "@varco/client";
import type { VarcoServerOptions } from "./types.js";

/**
 * Owns one persistent, auto-reconnecting Server Consumer connection.
 *
 * The underlying client (reconnect: true) re-establishes the relay after drops.
 * This manager adds an initial connect loop with backoff and a readiness gate so
 * HTTP requests can await-ready with a bounded timeout and return 503 on timeout.
 */
export class ConnectionManager {
  readonly client: VarcoConsumerClient;
  private ready = false;
  private closed = false;
  private waiters: Array<(ready: boolean) => void> = [];
  private startPromise: Promise<void> | null = null;

  constructor(private options: VarcoServerOptions) {
    const identity = consumerIdentityFromPrivateKey(options.privateKey);
    this.client = createVarcoConsumerClient({
      authorityId: options.authorityId,
      bridgeUrl: options.bridgeUrl,
      identity,
      storage: new MemoryStorage(),
      transport: options.transport ?? new NobleRelayTransport(options.bridgeUrl, options.authorityId, { requestTimeoutMs: options.requestTimeoutMs ?? 30_000 }),
      reconnect: true,
      connectionStrategy: VarcoConnectionStrategy.Relay,
      ...(options.manifest ? { manifest: options.manifest } : {}),
      onTransportStatus: (status) => {
        // A "reconnecting (attempt N)" detail means the link dropped; everything
        // else (authenticated / connected / reconnected / p2p) is a live link.
        const reconnecting = status.detail?.startsWith("reconnecting") ?? false;
        this.setReady(!reconnecting);
      },
      warn: options.warn,
    });
  }

  private setReady(value: boolean): void {
    this.ready = value;
    if (value) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const resolve of waiters) resolve(true);
    }
  }

  /** Connect once, then keep the client alive. Retries the initial connect with backoff. */
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      let attempt = 0;
      for (;;) {
        if (this.closed) return;
        try {
          await this.client.connect();
          this.setReady(true);
          return;
        } catch (err) {
          attempt += 1;
          this.options.warn?.(`Varco server connect failed (attempt ${attempt}): ${err instanceof Error ? err.message : String(err)}`);
          const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    })();
    return this.startPromise;
  }

  /** Resolve true when the connection is ready, false if it is not within timeoutMs. */
  async ensureReady(timeoutMs: number): Promise<boolean> {
    if (this.ready) return true;
    if (this.closed) return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      const timer = setTimeout(() => done(false), timeoutMs);
      this.waiters.push((ready) => { clearTimeout(timer); done(ready); });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.setReady(false);
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve(false);
    await this.client.close();
  }
}
