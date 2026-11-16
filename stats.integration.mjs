import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import pg from 'pg';
import { createStatsRouter, createStatsStore } from './stats.mjs';

test('PostgreSQL stores compact events, aggregates atomically, and cleans up old events', async t => {
  assert.ok(process.env.STATS_TEST_DATABASE_URL, 'Set STATS_TEST_DATABASE_URL to an isolated test database');
  const pool = new pg.Pool({ connectionString: process.env.STATS_TEST_DATABASE_URL });
  const schema = 'stats_test';
  await pool.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => {
    try { await pool.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await pool.end(); }
  });
  const store = createStatsStore(pool, schema);
  const visitorId = 'c0ffee00-1111-4111-8111-0123456789ab';
  const otherId = 'c0ffee00-2222-4222-8222-0123456789ab';
  const fixture = { visitorId, tier: 'A', fixtureId: 123 };
  await Promise.all([
    ...Array.from({ length: 5 }, () => store.recordEvent({ ...fixture, type: 'fixture' })),
    store.recordEvent({ ...fixture, type: 'reveal', score: 75.5 }),
    store.recordEvent({ ...fixture, type: 'hint' }),
    store.recordEvent({ ...fixture, type: 'badge:bullseye' }),
    store.recordEvent({ ...fixture, visitorId: otherId, type: 'fixture' }),
  ]);
  let result = await store.getStats();
  assert.equal(Number(result.visitors.all), 2);
  assert.equal(Number(result.visitors.today), 2);
  assert.equal(Number(result.visitors.twoToFive), 1);
  assert.equal(Number(result.visitors.one), 1);
  assert.equal(Number(result.visitors.games), 6);
  assert.equal(Number(result.totals.find(row => row.event_type === 'reveal').score_sum), 7550);
  assert.equal(Number(result.totals.find(row => row.event_type === 'fixture').count), 6);

  await pool.query(`UPDATE ${schema}.hindsight_stats_visitors SET first_day = current_date - 2, last_day = current_date - 2 WHERE visitor_id = $1`, [visitorId]);
  await store.recordEvent({ ...fixture, type: 'lock' });
  result = await store.getStats();
  assert.equal(Number(result.visitors.returned), 1);

  await pool.query(`UPDATE ${schema}.hindsight_stats_events SET occurred_at = now() - interval '91 days' WHERE visitor_id = $1`, [visitorId]);
  await store.cleanup();
  const remaining = await pool.query(`SELECT count(*) FROM ${schema}.hindsight_stats_events`);
  assert.equal(Number(remaining.rows[0].count), 1);
  result = await store.getStats();
  assert.equal(Number(result.visitors.all), 2);
  assert.equal(Number(result.visitors.returned), 1);
  assert.equal(Number(result.totals.find(row => row.event_type === 'fixture').count), 6);

  const app = express();
  app.use(createStatsRouter({ password: 'integration-password', ...store }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/notyourbusiness`;
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    assert.equal(await denied.text(), '');
    const response = await fetch(url, { headers: { authorization: `Basic ${Buffer.from('admin:integration-password').toString('base64')}` } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(html, new RegExp(`${visitorId}|${otherId}`, 'i'));
    assert.match(html, /75\.5%/);
    assert.match(html, /Bullseye/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
