import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { ClientRegistry } from '../../src/infrastructure/websocket/ClientRegistry.js';
import { WsBroadcaster } from '../../src/infrastructure/websocket/WsBroadcaster.js';
import { createWsServer } from '../../src/infrastructure/websocket/WsServer.js';
import { processMarketTick } from '../../src/application/ProcessMarketTick.js';
import { createEmptyPairState, type PairState } from '../../src/domain/models/PairState.js';
import { MarketUpdateSchema } from '../../contracts/schemas.js';

let server: FastifyInstance;
const clients: WebSocket[] = [];

async function startServer(
  allowedOrigins: string[] = [],
  limits: { maxConnectionsPerIp?: number; maxTotalConnections?: number; trustProxy?: boolean } = {}
) {
  server = Fastify();
  await server.listen({ port: 0, host: '127.0.0.1' });
  const registry = new ClientRegistry();
  createWsServer(server.server, registry, {
    allowedOrigins,
    maxConnectionsPerIp: limits.maxConnectionsPerIp ?? 10,
    maxTotalConnections: limits.maxTotalConnections ?? 100,
    trustProxy: limits.trustProxy ?? false,
  });
  const port = (server.server.address() as AddressInfo).port;
  return { registry, url: `ws://127.0.0.1:${port}` };
}

function connect(url: string, origin?: string, headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { ...(origin ? { origin } : {}), ...(headers ? { headers } : {}) });
    clients.push(ws);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function collect(ws: WebSocket, count: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const received: unknown[] = [];
    ws.on('message', (data) => {
      received.push(JSON.parse(data.toString()));
      if (received.length === count) resolve(received);
    });
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(async () => {
  for (const ws of clients.splice(0)) ws.terminate();
  await server?.close();
});

describe('WebSocket broadcast', () => {
  it('delivers one contract-valid update per pair per tick, stamped with the tick time', async () => {
    const { registry, url } = await startServer();
    const ws = await connect(url);
    const received = collect(ws, 2);
    await waitFor(() => registry.size === 1);
    expect(registry.size).toBe(1);

    const stateMap = new Map<string, PairState>([
      [
        'BTCUSDT',
        {
          ...createEmptyPairState('BTCUSDT'),
          price: 64000,
          bids: [{ price: 63999, quantity: 1 }],
          asks: [{ price: 64001, quantity: 3 }],
        },
      ],
      ['ETHUSDT', { ...createEmptyPairState('ETHUSDT'), price: 3200 }],
    ]);
    const tickTime = 1_780_000_000_123;
    processMarketTick(stateMap, new WsBroadcaster(registry), 10, tickTime);

    const updates = (await received).map((m) => MarketUpdateSchema.parse(m));
    expect(updates.map((u) => u.pair)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(updates.every((u) => u.lastUpdatedAt === tickTime)).toBe(true);
    expect(updates[0]).toMatchObject({ spread: 2, buyPressure: 25, sellPressure: 75 });
  });

  it('rejects a connection from an origin outside the allowlist with 403', async () => {
    const { url } = await startServer(['https://allowed.example']);

    await expect(connect(url, 'https://evil.example')).rejects.toThrow(/403/);
    await expect(connect(url, 'https://allowed.example')).resolves.toBeDefined();
  });

  it('removes a client from the registry when it disconnects', async () => {
    const { registry, url } = await startServer();
    const ws = await connect(url);
    await waitFor(() => registry.size === 1);
    expect(registry.size).toBe(1);

    ws.close();
    await waitFor(() => registry.size === 0);

    expect(registry.size).toBe(0);
  });

  it('rejects a connection over the total cap with 503 and admits one again after a client leaves', async () => {
    const { registry, url } = await startServer([], { maxTotalConnections: 2 });
    const first = await connect(url);
    await connect(url);
    await waitFor(() => registry.size === 2);

    await expect(connect(url)).rejects.toThrow(/503/);

    first.close();
    await waitFor(() => registry.size === 1);
    await expect(connect(url)).resolves.toBeDefined();
  });

  it('applies the per-IP cap to the socket address when the proxy is not trusted, ignoring X-Forwarded-For', async () => {
    const { registry, url } = await startServer([], { maxConnectionsPerIp: 1, trustProxy: false });
    await connect(url, undefined, { 'x-forwarded-for': '203.0.113.1' });
    await waitFor(() => registry.size === 1);

    await expect(connect(url, undefined, { 'x-forwarded-for': '203.0.113.2' })).rejects.toThrow(/429/);
  });

  it('applies the per-IP cap to the forwarded client address when the proxy is trusted', async () => {
    const { registry, url } = await startServer([], { maxConnectionsPerIp: 1, trustProxy: true });
    await connect(url, undefined, { 'x-forwarded-for': '203.0.113.1' });
    await connect(url, undefined, { 'x-forwarded-for': '203.0.113.2' });
    await waitFor(() => registry.size === 2);

    await expect(connect(url, undefined, { 'x-forwarded-for': '203.0.113.1' })).rejects.toThrow(/429/);
  });
});
