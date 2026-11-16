import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createStatsRouter } from './stats.mjs';

const visitorId = 'c0ffee00-1111-4111-8111-0123456789ab';

async function start(t, password = 'test-password') {
  const recorded = [];
  const app = express();
  app.use(createStatsRouter({
    password,
    recordEvent: async event => { recorded.push(event); },
    getStats: async () => ({
      visitors: { today: 2, week: 3, all: 4, returned: 1, one: 1, twoToFive: 2, sixPlus: 1, games: 12, visitorId },
      totals: [
        { event_type: 'fixture', tier: 'A', count: 12, score_sum: 0 },
        { event_type: 'reveal', tier: 'A', count: 8, score_sum: 40000 },
        { event_type: 'hint', tier: 'A', count: 4, score_sum: 0 },
        { event_type: 'badge:bullseye', tier: 'A', count: 2, score_sum: 0 },
      ],
      size: { database: 1024, events: 128, summaries: 256 },
    }),
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, recorded };
}

test('stats returns an empty response without the configured password', async t => {
  const { url } = await start(t);
  for (const authorization of [undefined, `Basic ${Buffer.from('admin:wrong').toString('base64')}`]) {
    const response = await fetch(`${url}/notyourbusiness`, { headers: authorization ? { authorization } : {} });
    assert.equal(response.status, 401);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('stats stays closed when no password is configured', async t => {
  const { url } = await start(t, '');
  const response = await fetch(`${url}/notyourbusiness`, {
    headers: { authorization: `Basic ${Buffer.from('admin:anything').toString('base64')}` },
  });
  assert.equal(response.status, 401);
  assert.equal(await response.text(), '');
});

test('unauthenticated requests receive no content even with malformed JSON', async t => {
  const { url } = await start(t);
  const response = await fetch(`${url}/notyourbusiness`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 401);
  assert.equal(await response.text(), '');
});

test('repeated failed password attempts are limited without recording addresses', async t => {
  const { url } = await start(t);
  for (let i = 0; i < 20; i++) {
    assert.equal((await fetch(`${url}/notyourbusiness`)).status, 401);
  }
  const limited = await fetch(`${url}/notyourbusiness`);
  assert.equal(limited.status, 429);
  assert.equal(await limited.text(), '');
});

test('authenticated stats contain aggregate values but no visitor identifier', async t => {
  const { url } = await start(t);
  const response = await fetch(`${url}/notyourbusiness`, {
    headers: { authorization: `Basic ${Buffer.from('admin:test-password').toString('base64')}` },
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, new RegExp(visitorId, 'i'));
  assert.match(body, /Players today/);
  assert.match(body, /50(?:\.0+)?%/);
  assert.match(body, /Bullseye/);
});

test('event endpoint accepts only compact, validated events', async t => {
  const { url, recorded } = await start(t);
  const post = body => fetch(`${url}/api/stats/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const valid = { type: 'reveal', visitorId, tier: 'A', fixtureId: 123, score: 75.5 };
  assert.equal((await post(valid)).status, 204);
  assert.deepEqual(recorded, [valid]);
  assert.equal((await post({ ...valid, type: 'badge:<script>' })).status, 400);
  assert.equal((await post({ ...valid, type: 'hint', score: 10 })).status, 400);
  assert.equal((await post({ ...valid, name: 'not collected' })).status, 400);
});

test('a failed event write does not delay or fail the response', async t => {
  const app = express();
  t.mock.method(console, 'warn', () => {});
  app.use(createStatsRouter({
    password: '',
    recordEvent: async () => { throw new Error('database unavailable'); },
    getStats: async () => { throw new Error('not used'); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/stats/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'fixture', visitorId, tier: 'A', fixtureId: 123 }),
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
});
