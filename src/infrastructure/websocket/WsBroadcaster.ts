import type { Broadcaster } from '../../domain/ports/Broadcaster.js';
import type { MarketUpdate } from '../../domain/models/MarketUpdate.js';
import type { ClientRegistry } from './ClientRegistry.js';
import { env } from '../../config/env.js';
import { metrics } from '../observability/Metrics.js';

/** Sole backpressure mechanism (ADR-B4): bufferedAmount is checked before each write, eviction after MAX_CONSECUTIVE_SKIPS. No queues. */
export class WsBroadcaster implements Broadcaster {
  constructor(
    private readonly registry: ClientRegistry,
    private readonly maxBufferedBytes: number = env.MAX_BUFFERED_BYTES,
    private readonly maxConsecutiveSkips: number = env.MAX_CONSECUTIVE_SKIPS
  ) {}

  broadcast(update: MarketUpdate): void {
    const payload = JSON.stringify(update);

    for (const client of this.registry.getAll()) {
      if (client.ws.bufferedAmount > this.maxBufferedBytes) {
        client.consecutiveSkips += 1;
        if (client.consecutiveSkips >= this.maxConsecutiveSkips) {
          client.ws.close(1013, 'Try again later');
          this.registry.remove(client);
        }
        metrics.wsMessagesDropped.inc(); // eviction counts as a drop too
        continue;
      }

      client.consecutiveSkips = 0;
      client.ws.send(payload);
      metrics.wsMessagesBroadcast.inc();
    }
  }
}
