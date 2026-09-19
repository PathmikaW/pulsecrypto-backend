import { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { ClientRegistry } from './ClientRegistry.js';
import { metrics } from '../observability/Metrics.js';

export interface WsServerOptions {
  /** Empty = no restriction (ADR-B9's documented default for local dev). */
  allowedOrigins: string[];
  maxConnectionsPerIp: number;
}

/** Inbound lifecycle only (origin allowlist, per-IP cap, registry bookkeeping); outbound backpressure is WsBroadcaster's (ADR-B2). */
export function createWsServer(
  httpServer: HttpServer,
  registry: ClientRegistry,
  options: WsServerOptions
): WebSocketServer {
  const connectionsByIp = new Map<string, number>();

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      if (options.allowedOrigins.length > 0 && !options.allowedOrigins.includes(info.origin)) {
        callback(false, 403, 'Forbidden origin');
        return;
      }

      const ip = info.req.socket.remoteAddress ?? 'unknown';
      if ((connectionsByIp.get(ip) ?? 0) >= options.maxConnectionsPerIp) {
        callback(false, 429, 'Too many connections from this address');
        return;
      }

      callback(true);
    },
  });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress ?? 'unknown';
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);

    const entry = registry.add(ws);
    metrics.wsConnectionsActive.set(registry.size);

    ws.on('close', () => {
      registry.remove(entry);
      connectionsByIp.set(ip, Math.max(0, (connectionsByIp.get(ip) ?? 1) - 1));
      metrics.wsConnectionsActive.set(registry.size);
    });
  });

  return wss;
}
