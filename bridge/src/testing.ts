export type RoutedMessage = { to: "authority" | "consumer"; sessionId: string; payload: unknown };

export class OpaqueRoom {
  authorityOnline = false;
  clients = new Set<string>();
  routed: RoutedMessage[] = [];

  connectAuthority(): void { this.authorityOnline = true; }
  disconnectAuthority(): void { this.authorityOnline = false; this.clients.clear(); }
  connectConsumer(sessionId: string): boolean {
    if (!this.authorityOnline) return false;
    this.clients.add(sessionId);
    this.routed.push({ to: "authority", sessionId, payload: { type: "client_connected", sessionId } });
    return true;
  }
  fromConsumer(sessionId: string, payload: unknown): void {
    if (this.authorityOnline && this.clients.has(sessionId)) this.routed.push({ to: "authority", sessionId, payload });
  }
  fromAuthority(sessionId: string, payload: unknown): void {
    if (this.clients.has(sessionId)) this.routed.push({ to: "consumer", sessionId, payload });
  }
}
