import type WebSocket from 'ws';

export interface ClientEntry {
  ws: WebSocket;
  consecutiveSkips: number;
  connectedAt: number;
}

/**
 * Tracks connected WebSocket clients — the ws instance, consecutive-skip counter, and
 * connection timestamp. One instance shared across the process (specs/buffering-strategy.md)
 * — not per-pair, not per-tick.
 */
export class ClientRegistry {
  private readonly clients = new Set<ClientEntry>();

  add(ws: WebSocket): ClientEntry {
    const entry: ClientEntry = { ws, consecutiveSkips: 0, connectedAt: Date.now() };
    this.clients.add(entry);
    return entry;
  }

  remove(entry: ClientEntry): void {
    this.clients.delete(entry);
  }

  getAll(): ClientEntry[] {
    return [...this.clients];
  }

  get size(): number {
    return this.clients.size;
  }
}
