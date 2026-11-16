import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getStatsVisitorId, logStatsEvent } from './stats.ts';

test('visitor ID is generated once and reused across visits', t => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const first = getStatsVisitorId();
  assert.match(first!, /^[0-9a-f-]{36}$/);
  assert.equal(getStatsVisitorId(), first);
});

test('event logging sends only compact fields and does not wait for the request', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'c0ffee00-1111-4111-8111-0123456789ab' },
  });

  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const request = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(() => {}));
  logStatsEvent('reveal', { id: 123, tier: 'A' }, 75.5);
  assert.equal(request.mock.callCount(), 1);
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(url, '/api/stats/events');
  assert.deepEqual(JSON.parse(String(options?.body)), {
    type: 'reveal', visitorId: 'c0ffee00-1111-4111-8111-0123456789ab', tier: 'A', fixtureId: 123, score: 75.5,
  });
});

test('unavailable browser storage never breaks the game', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => { throw new Error('unavailable'); } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  t.mock.method(console, 'warn', () => {});
  assert.doesNotThrow(() => logStatsEvent('fixture', { id: 123, tier: 'A' }));
});
