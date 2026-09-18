import { describe, it, expect } from 'vitest';
import { ClientRegistry } from '../../src/infrastructure/websocket/ClientRegistry.js';

describe('ClientRegistry', () => {
  it('adds a client and reflects it in size/getAll', () => {
    const registry = new ClientRegistry();
    const entry = registry.add({} as import('ws').default);

    expect(registry.size).toBe(1);
    expect(registry.getAll()).toEqual([entry]);
    expect(entry.consecutiveSkips).toBe(0);
  });

  it('removes a client by its entry reference', () => {
    const registry = new ClientRegistry();
    const entry = registry.add({} as import('ws').default);
    registry.remove(entry);

    expect(registry.size).toBe(0);
  });

  it('tracks multiple independent clients', () => {
    const registry = new ClientRegistry();
    registry.add({} as import('ws').default);
    registry.add({} as import('ws').default);

    expect(registry.size).toBe(2);
  });
});
