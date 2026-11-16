import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';

const badges = {
  bullseye: 'Bullseye', sharpshooter: 'Sharpshooter', 'brace-yourself': 'Brace Yourself',
  'clean-sweep': 'Clean Sweep', 'flawless-read': 'Flawless Read',
  'perfect-memory': 'Perfect Memory', 'perfect-with-hint': 'Perfect with a Hint',
  'super-sub': 'Super Sub', 'hat-trick-hero': 'Hat-Trick Hero', 'both-ends': 'Both Ends',
  'first-in-line': 'First in Line', 'golden-boot-scout': 'Golden Boot Scout',
  'on-the-nose': 'On the Nose', 'hot-hand': 'Hot Hand', 'hat-trick': 'Hat-Trick',
  'comeback-kid': 'Comeback Kid', 'time-traveller': 'Time Traveller',
  'derby-day': 'Derby Day', 'deep-cut': 'Deep Cut', 'no-hints-needed': 'No Hints Needed',
  'against-the-grain': 'Against the Grain',
};
const types = new Set(['fixture', 'lock', 'reveal', 'hint', ...Object.keys(badges).map(id => `badge:${id}`)]);

function validEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  if (Object.keys(event).some(key => !['type', 'visitorId', 'tier', 'fixtureId', 'score'].includes(key))) return false;
  if (!types.has(event.type) || typeof event.visitorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.visitorId)) return false;
  if (!['A', 'B', 'C'].includes(event.tier) || !Number.isInteger(event.fixtureId) || event.fixtureId < 1 || event.fixtureId > 2147483647) return false;
  return event.type === 'reveal'
    ? typeof event.score === 'number' && Number.isFinite(event.score) && event.score >= 0 && event.score <= 100
    : event.score === undefined;
}

function authenticated(header, password) {
  if (!password || typeof header !== 'string' || !header.startsWith('Basic ')) return false;
  const credentials = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = credentials.indexOf(':');
  if (separator < 0) return false;
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(credentials.slice(separator + 1)), hash(password));
}

function renderStats({ visitors, totals, size }) {
  const count = (type, tier) => totals
    .filter(row => row.event_type === type && (!tier || row.tier === tier))
    .reduce((sum, row) => sum + Number(row.count), 0);
  const score = tier => totals
    .filter(row => row.event_type === 'reveal' && (!tier || row.tier === tier))
    .reduce((sum, row) => sum + Number(row.score_sum), 0);
  const number = value => Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  const bytes = value => `${number(value)} bytes (${number(Number(value) / 1048576)} MiB)`;
  const ratio = (a, b, suffix = '') => b ? `${number(a / b)}${suffix}` : '—';
  const started = count('fixture');
  const finished = count('reveal');
  const tiers = ['A', 'B', 'C'];
  const maxTier = Math.max(...tiers.map(tier => count('fixture', tier)));
  const mostPicked = maxTier ? tiers.filter(tier => count('fixture', tier) === maxTier).join(', ') : '—';
  const row = (label, value) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
  const tierRows = tiers.map(tier => row(`Tier ${tier}`, ratio(score(tier), count('reveal', tier) * 100, '%'))).join('');
  const badgeRows = Object.entries(badges).map(([id, name]) => row(name, number(count(`badge:${id}`)))).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Hindsight stats</title>
<style>
body { font-family: system-ui, sans-serif; color: oklch(0.25 0 none); background: oklch(0.98 0 none); margin: 0; }
main { display: grid; grid-template-columns: minmax(1rem, 1fr) min(100% - 2rem, 48rem) minmax(1rem, 1fr); padding-block: 2rem; }
main > * { grid-column: 2; } h1, h2 { text-wrap: balance; } p { line-height: 1.5; }
table { border-collapse: collapse; inline-size: 100%; margin-block-end: 1.5rem; } th, td { padding: .5rem; border: 1px solid oklch(0.8 0 none); text-align: start; } td { font-variant-numeric: tabular-nums; }
</style></head><body><main><h1>Hindsight stats</h1>
<p>All time starts when statistics were enabled. Days are UTC. Today and this week count players with recorded activity; this week is the last seven UTC days including today.</p>
<h2>Players and games</h2><table><tbody>
${row('Players today', number(visitors.today))}${row('Players this week', number(visitors.week))}${row('Players all time', number(visitors.all))}
${row('Players who returned on a later day', number(visitors.returned))}
${row('Games started', number(started))}${row('Games finished', number(finished))}${row('Share finished', ratio(finished * 100, started, '%'))}
${row('Games per player', ratio(Number(visitors.games), Number(visitors.all)))}
${row('Players with 1 game', number(visitors.one))}${row('Players with 2 to 5 games', number(visitors.twoToFive))}${row('Players with 6 or more games', number(visitors.sixPlus))}
${row('Most served tier', mostPicked)}${row('Hints used per game started', ratio(count('hint'), started))}
</tbody></table><h2>Memory score</h2><table><tbody>${row('Average', ratio(score(), finished * 100, '%'))}${tierRows}</tbody></table>
<h2>Badges earned</h2><table><tbody>${badgeRows}</tbody></table>
<h2>Database size</h2><table><tbody>${row('Entire database', bytes(size.database))}${row('Event table including indexes', bytes(size.events))}${row('Summary tables including indexes', bytes(size.summaries))}</tbody></table>
<p>Event rows are deleted after 90 days. Compact per visitor and aggregate summaries are retained for all time totals. Statistics are best effort and may be incomplete.</p></main></body></html>`;
}

export function createStatsRouter({ password, recordEvent, getStats }) {
  const router = express.Router();
  let pendingWrites = 0;
  let failedAttempts = 0;
  let windowStarted = Date.now();
  router.post('/api/stats/events', express.json({ limit: '1kb' }), (req, res) => {
    if (!validEvent(req.body)) return res.status(400).end();
    if (pendingWrites >= 32) {
      console.warn('[Stats] Event write capacity reached.');
      return res.status(204).end();
    }
    pendingWrites++;
    void Promise.resolve().then(() => recordEvent(req.body)).catch(() => {
      console.warn('[Stats] Event write failed.');
    }).finally(() => { pendingWrites--; });
    res.status(204).end();
  });
  router.use('/notyourbusiness', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (Date.now() - windowStarted >= 60_000) {
      windowStarted = Date.now();
      failedAttempts = 0;
    }
    if (failedAttempts >= 20) return res.status(429).end();
    if (!authenticated(req.headers.authorization, password)) {
      failedAttempts++;
      return res.set('WWW-Authenticate', 'Basic realm="Hindsight statistics", charset="UTF-8"').status(401).end();
    }
    next();
  });
  router.get('/notyourbusiness', async (_req, res) => {
    try {
      res.type('html').send(renderStats(await getStats()));
    } catch {
      console.error('[Stats] Statistics lookup failed.');
      res.status(503).end();
    }
  });
  router.use('/notyourbusiness', (_req, res) => res.status(404).end());
  return router;
}

export function createStatsStore(pool, schema) {
  let ready;
  function initialize() {
    if (!ready) {
      ready = pool.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.hindsight_stats_events (
          event_type varchar(32) NOT NULL, visitor_id uuid NOT NULL, tier char(1) NOT NULL,
          fixture_id integer NOT NULL, match_score smallint, occurred_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS hindsight_stats_events_time_idx ON ${schema}.hindsight_stats_events (occurred_at);
        CREATE TABLE IF NOT EXISTS ${schema}.hindsight_stats_visitors (
          visitor_id uuid PRIMARY KEY, first_day date NOT NULL, last_day date NOT NULL,
          returned boolean NOT NULL DEFAULT false, games integer NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ${schema}.hindsight_stats_totals (
          event_type varchar(32) NOT NULL, tier char(1) NOT NULL,
          count bigint NOT NULL, score_sum bigint NOT NULL, PRIMARY KEY (event_type, tier)
        )
      `).catch(error => { ready = undefined; throw error; });
    }
    return ready;
  }
  async function recordEvent(event) {
    await initialize();
    await pool.query(`
      WITH inserted AS (
        INSERT INTO ${schema}.hindsight_stats_events (event_type, visitor_id, tier, fixture_id, match_score)
        VALUES ($1, $2, $3, $4, $5) RETURNING occurred_at
      ), visitor AS (
        INSERT INTO ${schema}.hindsight_stats_visitors AS v (visitor_id, first_day, last_day, games)
        SELECT $2, (occurred_at AT TIME ZONE 'UTC')::date, (occurred_at AT TIME ZONE 'UTC')::date,
          CASE WHEN $1 = 'fixture' THEN 1 ELSE 0 END FROM inserted
        ON CONFLICT (visitor_id) DO UPDATE SET
          returned = v.returned OR v.first_day < EXCLUDED.last_day OR v.last_day > EXCLUDED.first_day,
          first_day = LEAST(v.first_day, EXCLUDED.first_day),
          last_day = GREATEST(v.last_day, EXCLUDED.last_day), games = v.games + EXCLUDED.games
      )
      INSERT INTO ${schema}.hindsight_stats_totals AS t (event_type, tier, count, score_sum)
      VALUES ($1, $3, 1, COALESCE($5::integer, 0))
      ON CONFLICT (event_type, tier) DO UPDATE SET count = t.count + 1, score_sum = t.score_sum + EXCLUDED.score_sum
    `, [event.type, event.visitorId, event.tier, event.fixtureId, event.score === undefined ? null : Math.round(event.score * 100)]);
  }
  async function getStats() {
    await initialize();
    const [visitorResult, totalResult, sizeResult] = await Promise.all([
      pool.query(`
        SELECT count(*) AS all, count(*) FILTER (WHERE returned) AS returned,
          count(*) FILTER (WHERE games = 1) AS one, count(*) FILTER (WHERE games BETWEEN 2 AND 5) AS "twoToFive",
          count(*) FILTER (WHERE games >= 6) AS "sixPlus", COALESCE(sum(games), 0) AS games,
          (SELECT count(DISTINCT visitor_id) FROM ${schema}.hindsight_stats_events
            WHERE occurred_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) AS today,
          (SELECT count(DISTINCT visitor_id) FROM ${schema}.hindsight_stats_events
            WHERE occurred_at >= ((date_trunc('day', now() AT TIME ZONE 'UTC') - interval '6 days') AT TIME ZONE 'UTC')) AS week
        FROM ${schema}.hindsight_stats_visitors
      `),
      pool.query(`SELECT event_type, tier, count, score_sum FROM ${schema}.hindsight_stats_totals`),
      pool.query(`SELECT pg_database_size(current_database()) AS database,
        pg_total_relation_size('${schema}.hindsight_stats_events') AS events,
        pg_total_relation_size('${schema}.hindsight_stats_visitors') + pg_total_relation_size('${schema}.hindsight_stats_totals') AS summaries`),
    ]);
    return { visitors: visitorResult.rows[0], totals: totalResult.rows, size: sizeResult.rows[0] };
  }
  async function cleanup() {
    await initialize();
    await pool.query(`DELETE FROM ${schema}.hindsight_stats_events WHERE occurred_at < now() - interval '90 days'`);
  }
  return { recordEvent, getStats, cleanup };
}
