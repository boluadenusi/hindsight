import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

// node:test runs outside a browser, so give the module a minimal localStorage
// before it is loaded. Imports are static, so the shim has to exist first.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => store.clear(),
} as unknown as Storage;

const {
  pickCaughtYouMessage,
  CAUGHT_YOU_MESSAGES,
  SHORT_MAX_SECONDS,
  MIN_GAP_SECONDS,
  MAX_PER_FIXTURE,
} = await import('./caughtYou.ts');

const FIXTURE = 42;
const GAP = MIN_GAP_SECONDS * 1000 + 1_000; // just past the two-minute cooldown

describe('caught you — message picker', () => {
  beforeEach(() => {
    store.clear();
  });

  it('never fires for a trip under one second', () => {
    assert.equal(pickCaughtYouMessage(FIXTURE, 0.4), null);
    assert.equal(pickCaughtYouMessage(FIXTURE, 0.9), null);
  });

  it('ignores a trip under five seconds', () => {
    assert.equal(pickCaughtYouMessage(FIXTURE, 4.9), null);
  });

  it('picks a short message for a trip under thirty seconds', () => {
    const message = pickCaughtYouMessage(FIXTURE, 12);
    assert.ok(message);
    assert.ok(CAUGHT_YOU_MESSAGES.short.includes(message));
  });

  it('picks a long message for a trip of thirty seconds or more', () => {
    const message = pickCaughtYouMessage(FIXTURE, 30);
    assert.ok(message);
    assert.ok(CAUGHT_YOU_MESSAGES.long.includes(message));
  });

  it('never repeats the last message it showed', () => {
    const first = pickCaughtYouMessage(FIXTURE, 12);
    assert.ok(first);
    // Advance past the two-minute cooldown so the next pick is allowed.
    const second = pickCaughtYouMessage(FIXTURE, 12, Date.now() + GAP);
    assert.ok(second);
    assert.notEqual(first, second);
  });

  it('caps at three messages per fixture', () => {
    let t = 1_000_000;
    pickCaughtYouMessage(FIXTURE, 12, t += GAP);
    pickCaughtYouMessage(FIXTURE, 12, t += GAP);
    pickCaughtYouMessage(FIXTURE, 12, t += GAP);
    assert.equal(pickCaughtYouMessage(FIXTURE, 12, t += GAP), null);
  });

  it('respects the two-minute minimum gap', () => {
    pickCaughtYouMessage(FIXTURE, 12);
    // 60 seconds later — still on cooldown.
    assert.equal(pickCaughtYouMessage(FIXTURE, 12, Date.now() + 60_000), null);
    // 121 seconds later — off cooldown.
    const later = pickCaughtYouMessage(FIXTURE, 12, Date.now() + 121_000);
    assert.ok(later);
  });

  it('keeps separate state per fixture', () => {
    let t = 1_000_000;
    pickCaughtYouMessage(1, 12, t += GAP);
    pickCaughtYouMessage(1, 12, t += GAP);
    pickCaughtYouMessage(1, 12, t += GAP);
    // Fixture 1 is capped; fixture 2 is still fresh.
    assert.equal(pickCaughtYouMessage(1, 12, t += GAP), null);
    assert.ok(pickCaughtYouMessage(2, 12, t += GAP));
  });

  it('exposes the message lists', () => {
    assert.equal(SHORT_MAX_SECONDS, 30);
    assert.equal(MIN_GAP_SECONDS, 120);
    assert.equal(MAX_PER_FIXTURE, 3);
    assert.ok(CAUGHT_YOU_MESSAGES.short.length >= 2);
    assert.ok(CAUGHT_YOU_MESSAGES.long.length >= 2);
  });
});