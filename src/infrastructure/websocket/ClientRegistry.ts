import type WebSocket from 'ws';

export interface ClientEntry {
  ws: WebSocket;
  consecutiveSkips: number;
  connectedAt: number;
}

/** One instance shared process-wide; not per pair or per tick. */
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
