import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { ensureWarmupQuestions } from './warmupQuestions.mjs';
import { createStatsRouter, createStatsStore } from './stats.mjs';
import { addFixtureToClubTiers, selectFixture } from './fixtureDraw.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
let envFile = '';
try {
  envFile = readFileSync(path.join(root, '.env'), 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure it.');
const schema = (process.env.DATABASE_SCHEMA || 'core').replace(/[^a-zA-Z0-9_]/g, '');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  options: `-c search_path=${schema} -c max_parallel_workers_per_gather=0`,
});
const statsPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  options: `-c search_path=${schema} -c max_parallel_workers_per_gather=0`,
  max: 2,
  connectionTimeoutMillis: 2000,
});
const app = express();
app.disable('x-powered-by');
const stats = createStatsStore(statsPool, schema);
app.use(createStatsRouter({ password: process.env.STATS_PASSWORD, ...stats }));
app.use(express.json({ limit: '256kb' }));
function cleanStats() {
  void stats.cleanup().catch(() => console.warn('[Stats] Event cleanup failed.'));
}
cleanStats();
setInterval(cleanStats, 6 * 60 * 60 * 1000).unref();
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

const fixtureConfig = JSON.parse(readFileSync(path.join(root, 'config', 'fixtures.json'), 'utf8'));
const topFiveLeagueIds = fixtureConfig.topFiveLeagues.map((l) => l.id);
const bigClubIds = new Set(fixtureConfig.bigClubs.map((c) => c.id));

let tierCache = null;
async function getEligibleFixtureTiers() {
  if (tierCache) return tierCache;

  // Verify configured big club IDs against the database
  const { rows: matchedClubs } = await pool.query(
    `SELECT id, name FROM ${schema}.club WHERE id = ANY($1::int[])`,
    [[...bigClubIds]]
  );
  const matchedIds = new Set(matchedClubs.map((c) => c.id));
  const unmatched = fixtureConfig.bigClubs.filter((c) => !matchedIds.has(c.id));
  if (unmatched.length > 0) {
    console.warn(`[WARNING] ${unmatched.length} big clubs on the list could not be matched in database:`, unmatched);
  } else {
    console.log(`[OK] All ${fixtureConfig.bigClubs.length} big clubs verified in database.`);
  }

  // Restrict candidate queries strictly to the top 5 leagues
  const { rows: candidates } = await pool.query(`
    SELECT g.id, g.home_club_id, g.away_club_id, home.name AS home_name, away.name AS away_name
    FROM ${schema}.game g
    JOIN ${schema}.competition competition ON competition.id = g.competition_id
    JOIN ${schema}.club home ON home.id = g.home_club_id
    JOIN ${schema}.club away ON away.id = g.away_club_id
    JOIN (
      SELECT l.game_id,
        count(DISTINCT l.player_id) FILTER (WHERE l.club_id = g.home_club_id AND p.name IS NOT NULL) AS home_count,
        count(DISTINCT l.player_id) FILTER (WHERE l.club_id = g.away_club_id AND p.name IS NOT NULL) AS away_count
      FROM ${schema}.lineup l
      JOIN ${schema}.game g ON g.id = l.game_id
      JOIN ${schema}.player p ON p.id = l.player_id
      WHERE l.type = 'starting'
      GROUP BY l.game_id, g.home_club_id, g.away_club_id
    ) starters ON starters.game_id = g.id
    WHERE g.competition_id = ANY($1::int[])
      AND g.game_date IS NOT NULL AND competition.name IS NOT NULL
      AND home.name IS NOT NULL AND away.name IS NOT NULL
      AND starters.home_count = 11 AND starters.away_count = 11
  `, [topFiveLeagueIds]);

  const ids = candidates.map((row) => row.id);
  if (!ids.length) {
    tierCache = { A: [], B: [], C: [], all: new Set(), clubs: new Map(), clubNames: new Map(), unmatched };
    return tierCache;
  }

  // Read small, flat result sets to avoid large parallel hash joins
  const { rows: games } = await pool.query(
    `SELECT id, home_club_id, away_club_id, home_goals, away_goals FROM ${schema}.game WHERE id = ANY($1::int[])`,
    [ids]
  );
  const { rows: goals } = await pool.query(
    `SELECT e.game_id, e.club_id, e.player_id, p.name AS player_name 
     FROM ${schema}.event e 
     LEFT JOIN ${schema}.player p ON p.id = e.player_id 
     WHERE e.type = 'Goals' AND e.game_id = ANY($1::int[])`,
    [ids]
  );

  const gameById = new Map(games.map((game) => [game.id, game]));
  const goalsByGame = new Map();
  for (const goal of goals) {
    const game = gameById.get(goal.game_id);
    if (!game) continue;
    let tally = goalsByGame.get(goal.game_id);
    if (!tally) {
      tally = { total: 0, home: 0, away: 0, named: true };
      goalsByGame.set(goal.game_id, tally);
    }
    // The data check confirmed event.club_id is already the team awarded the
    // goal, including own goals (it is opposite the scorer's team). Do not flip it.
    tally.total += 1;
    if (goal.club_id === game.home_club_id) tally.home += 1;
    else if (goal.club_id === game.away_club_id) tally.away += 1;
    if (!goal.player_id || !goal.player_name || (goal.club_id !== game.home_club_id && goal.club_id !== game.away_club_id)) {
      tally.named = false;
    }
  }

  const tiers = { A: [], B: [], C: [] };
  const clubs = new Map();
  const clubNames = new Map();
  for (const candidate of candidates) {
    const game = gameById.get(candidate.id);
    const tally = goalsByGame.get(candidate.id) ?? { total: 0, home: 0, away: 0, named: true };
    const isComplete = game && game.home_goals !== null && game.away_goals !== null
      && tally.home === game.home_goals && tally.away === game.away_goals
      && tally.total === game.home_goals + game.away_goals && tally.named;

    if (isComplete) {
      const homeIsBig = bigClubIds.has(candidate.home_club_id);
      const awayIsBig = bigClubIds.has(candidate.away_club_id);
      const tier = homeIsBig && awayIsBig ? 'A' : homeIsBig || awayIsBig ? 'B' : 'C';
      tiers[tier].push(candidate.id);
      addFixtureToClubTiers(clubs, candidate, tier);
      clubNames.set(candidate.home_club_id, candidate.home_name);
      clubNames.set(candidate.away_club_id, candidate.away_name);
    }
  }

  tierCache = {
    ...tiers,
    all: new Set([...tiers.A, ...tiers.B, ...tiers.C]),
    clubs,
    clubNames,
    unmatched,
  };
  console.log(`[Tier Cache] Ready: Tier A: ${tiers.A.length}, Tier B: ${tiers.B.length}, Tier C: ${tiers.C.length} (Total: ${tierCache.all.size})`);
  return tierCache;
}

async function getTeamForm(clubId, beforeDate) {
  if (!clubId || !beforeDate) return [];
  const { rows } = await pool.query(`
    SELECT g.id, to_char(g.game_date, 'YYYY-MM-DD') AS game_date,
      comp.name AS competition,
      CASE 
        WHEN (g.home_club_id = $1 AND g.home_goals > g.away_goals) OR (g.away_club_id = $1 AND g.away_goals > g.home_goals) THEN 'W'
        WHEN g.home_goals = g.away_goals THEN 'D'
        ELSE 'L'
      END AS result,
      CASE WHEN g.home_club_id = $1 THEN 'H' ELSE 'A' END AS venue,
      CASE WHEN g.home_club_id = $1 THEN c_away.name ELSE c_home.name END AS opponent,
      CASE WHEN g.home_club_id = $1 THEN g.away_club_id ELSE g.home_club_id END AS opponent_club_id,
      CASE WHEN g.home_club_id = $1 THEN CONCAT(g.home_goals, '-', g.away_goals) ELSE CONCAT(g.away_goals, '-', g.home_goals) END AS score
    FROM ${schema}.game g
    JOIN ${schema}.club c_home ON c_home.id = g.home_club_id
    JOIN ${schema}.club c_away ON c_away.id = g.away_club_id
    JOIN ${schema}.competition comp ON comp.id = g.competition_id
    WHERE (g.home_club_id = $1 OR g.away_club_id = $1)
      AND g.game_date < $2::date
      AND g.home_goals IS NOT NULL AND g.away_goals IS NOT NULL
    ORDER BY g.game_date DESC, g.id DESC
    LIMIT 5
  `, [clubId, beforeDate]);
  return rows.map((row) => ({
    ...row,
    // Weight each result by the quality of the opponent it was earned against.
    opponentIsBigClub: bigClubIds.has(row.opponent_club_id),
  }));
}

// Fixture selection: picks a tier first (A: 45%, B: 40%, C: 15%), then a random fixture inside it,
// falling back to the next tier if no unplayed fixtures remain in that tier.
async function getNextFixture(playedIds = [], clubId = null) {
  const cache = await getEligibleFixtureTiers();
  const tiers = clubId === null ? cache : cache.clubs.get(clubId);
  if (!tiers) return null;
  const selection = selectFixture(tiers, playedIds, fixtureConfig.tierPercentages || {});
  if (!selection) return null;
  const { gameId, tier: assignedTier } = selection;

  const { rows } = await pool.query(`
    SELECT g.id, to_char(g.game_date, 'YYYY-MM-DD') AS game_date, g.home_formation, g.away_formation,
      g.home_club_id, g.away_club_id, g.round,
      season.season_year,
      competition.name AS competition,
      home.name AS home_team, away.name AS away_team,
      NULLIF(btrim(g.home_manager_name), '') AS home_manager,
      NULLIF(btrim(g.away_manager_name), '') AS away_manager,
      COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'position', l.position, 'shirtNumber', l.shirt_number)
        ORDER BY NULLIF(regexp_replace(l.shirt_number, '[^0-9]', '', 'g'), '')::int NULLS LAST, p.name)
        FROM ${schema}.lineup l JOIN ${schema}.player p ON p.id = l.player_id
        WHERE l.game_id = g.id AND l.club_id = g.home_club_id AND l.type = 'starting' AND p.name IS NOT NULL), '[]'::json) AS home_lineup,
      COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'position', l.position, 'shirtNumber', l.shirt_number)
        ORDER BY NULLIF(regexp_replace(l.shirt_number, '[^0-9]', '', 'g'), '')::int NULLS LAST, p.name)
        FROM ${schema}.lineup l JOIN ${schema}.player p ON p.id = l.player_id
        WHERE l.game_id = g.id AND l.club_id = g.away_club_id AND l.type = 'starting' AND p.name IS NOT NULL), '[]'::json) AS away_lineup,
      COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'position', l.position, 'shirtNumber', l.shirt_number)
        ORDER BY NULLIF(regexp_replace(l.shirt_number, '[^0-9]', '', 'g'), '')::int NULLS LAST, p.name)
        FROM ${schema}.lineup l JOIN ${schema}.player p ON p.id = l.player_id
        WHERE l.game_id = g.id AND l.club_id = g.home_club_id AND l.type = 'substitute' AND p.name IS NOT NULL), '[]'::json) AS home_subs,
      COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'position', l.position, 'shirtNumber', l.shirt_number)
        ORDER BY NULLIF(regexp_replace(l.shirt_number, '[^0-9]', '', 'g'), '')::int NULLS LAST, p.name)
        FROM ${schema}.lineup l JOIN ${schema}.player p ON p.id = l.player_id
        WHERE l.game_id = g.id AND l.club_id = g.away_club_id AND l.type = 'substitute' AND p.name IS NOT NULL), '[]'::json) AS away_subs
    FROM ${schema}.game g
    JOIN ${schema}.competition competition ON competition.id = g.competition_id
    JOIN ${schema}.season season ON season.id = g.season_id
    JOIN ${schema}.club home ON home.id = g.home_club_id
    JOIN ${schema}.club away ON away.id = g.away_club_id
    WHERE g.id = $1
  `, [gameId]);

  const fixture = rows[0];
  if (!fixture) return null;
  fixture.tier = assignedTier;
  // Big-club flags for badges (Against the Grain). No outcome information leaks here.
  fixture.homeIsBigClub = bigClubIds.has(fixture.home_club_id);
  fixture.awayIsBigClub = bigClubIds.has(fixture.away_club_id);

  const [homeForm, awayForm] = await Promise.all([
    getTeamForm(fixture.home_club_id, fixture.game_date),
    getTeamForm(fixture.away_club_id, fixture.game_date),
  ]);
  fixture.home_form = homeForm;
  fixture.away_form = awayForm;
  delete fixture.home_club_id;
  delete fixture.away_club_id;
  return fixture;
}

app.post('/api/fixtures/next', async (req, res) => {
  try {
    const clubId = req.body?.clubId ?? null;
    if (clubId !== null && (!Number.isSafeInteger(clubId) || clubId <= 0)) {
      return res.status(400).json({ message: 'Choose a valid club.' });
    }
    const playedIds = Array.isArray(req.body?.playedFixtureIds)
      ? req.body.playedFixtureIds.filter((id) => Number.isSafeInteger(id) && id > 0)
      : [];
    const fixture = await getNextFixture(playedIds, clubId);
    if (!fixture) return res.status(404).json({ message: clubId === null
      ? 'No unused fixtures with complete starting lineups are available in the top five leagues.'
      : 'No unused eligible fixtures are available for this club. Choose another club or free for all.' });
    // Deliberately return pre-match facts only. Result and event fields never leave this server here.
    res.set('Cache-Control', 'no-store').json(fixture);
  } catch (error) {
    console.error('Fixture lookup failed:', error.message);
    res.status(503).json({ message: 'The fixture archive is unavailable right now.' });
  }
});

app.get('/api/clubs', async (_req, res) => {
  try {
    const cache = await getEligibleFixtureTiers();
    const clubs = [...cache.clubNames].map(([id, name]) => ({ id, name }));
    clubs.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    res.set('Cache-Control', 'no-store').json(clubs);
  } catch (error) {
    console.error('Club lookup failed:', error.message);
    res.status(503).json({ message: 'The club list is unavailable right now.' });
  }
});

app.get('/api/fixtures/:id/managers', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'Invalid fixture ID.' });
    }
    const { rows } = await pool.query(`
      SELECT NULLIF(btrim(home_manager_name), '') AS home_manager,
        NULLIF(btrim(away_manager_name), '') AS away_manager
      FROM ${schema}.game
      WHERE id = $1
    `, [gameId]);
    if (!rows[0]) return res.status(404).json({ message: 'That fixture could not be found.' });
    res.set('Cache-Control', 'no-store').json(rows[0]);
  } catch (error) {
    console.error('Manager lookup failed:', error.message);
    res.status(503).json({ message: 'The manager information is unavailable right now.' });
  }
});

app.get('/api/config/tiers', async (_req, res) => {
  try {
    const cache = await getEligibleFixtureTiers();
    res.json({
      percentages: fixtureConfig.tierPercentages,
      counts: {
        A: cache.A.length,
        B: cache.B.length,
        C: cache.C.length,
        total: cache.all.size,
      },
      bigClubsTotal: fixtureConfig.bigClubs.length,
      unmatchedBigClubs: cache.unmatched || [],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/fixtures/:id/hint/goal-count', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'Invalid fixture ID.' });
    }
    const { rows } = await pool.query(
      `SELECT home_goals, away_goals FROM ${schema}.game WHERE id = $1`,
      [gameId]
    );
    const game = rows[0];
    if (!game || game.home_goals === null || game.away_goals === null) {
      return res.status(404).json({ message: 'The goal count is not available for this fixture.' });
    }
    // Reveals the total only — never the scoreline.
    res.set('Cache-Control', 'no-store').json({ totalGoals: game.home_goals + game.away_goals });
  } catch (error) {
    console.error('Goal-count hint failed:', error.message);
    res.status(503).json({ message: 'The hint is unavailable right now.' });
  }
});

app.post('/api/fixtures/:id/hint/spotlight', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'Invalid fixture ID.' });
    }
    const { rows } = await pool.query(`
      SELECT e.player_id AS "playerId", p.name AS "playerName"
      FROM ${schema}.event e
      JOIN ${schema}.player p ON p.id = e.player_id
      WHERE e.game_id = $1 AND e.type = 'Goals' AND e.player_id IS NOT NULL
        AND coalesce(e.description, '') !~* 'own[- ]goal'
      ORDER BY random()
      LIMIT 1
    `, [gameId]);
    res.set('Cache-Control', 'no-store').json(rows[0] || { playerId: null, playerName: null });
  } catch (error) {
    console.error('Spotlight hint failed:', error.message);
    res.status(503).json({ message: 'The hint is unavailable right now.' });
  }
});

app.post('/api/fixtures/:id/hint/first-team', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'Invalid fixture ID.' });
    }
    const { rows: games } = await pool.query(
      `SELECT id, home_club_id, away_club_id, home_goals, away_goals FROM ${schema}.game WHERE id = $1`,
      [gameId]
    );
    const game = games[0];
    if (!game || game.home_goals === null || game.away_goals === null) {
      return res.status(404).json({ message: 'The first scoring team is not available for this fixture.' });
    }
    if (game.home_goals + game.away_goals === 0) {
      return res.set('Cache-Control', 'no-store').json({ firstTeam: 'none' });
    }

    const { rows: goals } = await pool.query(`
      SELECT e.club_id AS "clubId", e.minute
      FROM ${schema}.event e
      WHERE e.game_id = $1 AND e.type = 'Goals'
      ORDER BY e.minute NULLS LAST, e.id
    `, [gameId]);
    const totalGoals = game.home_goals + game.away_goals;
    const firstGoal = goals[0];
    const orderIsReliable = goals.length === totalGoals
      && goals.every((goal) => typeof goal.minute === 'number' && Number.isFinite(goal.minute));
    if (!orderIsReliable || !firstGoal) {
      return res.status(404).json({ message: 'The first scoring team is not available for this fixture.' });
    }
    const firstTeam = firstGoal.clubId === game.home_club_id
      ? 'home'
      : firstGoal.clubId === game.away_club_id ? 'away' : null;
    if (!firstTeam) {
      return res.status(404).json({ message: 'The first scoring team is not available for this fixture.' });
    }
    res.set('Cache-Control', 'no-store').json({ firstTeam });
  } catch (error) {
    console.error('First-team hint failed:', error.message);
    res.status(503).json({ message: 'The hint is unavailable right now.' });
  }
});

app.post('/api/fixtures/:id/reveal', async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
      return res.status(400).json({ message: 'Invalid fixture ID.' });
    }
    const { rows } = await pool.query(`
      SELECT g.home_goals, g.away_goals,
        COALESCE(json_agg(json_build_object(
          'playerId', e.player_id,
          'playerName', p.name,
          'team', CASE WHEN e.club_id = g.home_club_id THEN 'home' ELSE 'away' END,
          'minute', e.minute,
          'ownGoal', coalesce(e.description, '') ~* 'own[- ]goal'
        ) ORDER BY e.minute NULLS LAST, e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS goals
      FROM ${schema}.game g
      LEFT JOIN ${schema}.event e ON e.game_id = g.id AND e.type = 'Goals'
      LEFT JOIN ${schema}.player p ON p.id = e.player_id
      WHERE g.id = $1
      GROUP BY g.id
    `, [gameId]);
    const result = rows[0];
    if (!result || result.home_goals === null || result.away_goals === null) {
      return res.status(404).json({ message: 'The result is not available for this fixture.' });
    }
    res.set('Cache-Control', 'no-store').json({
      homeGoals: result.home_goals,
      awayGoals: result.away_goals,
      goals: result.goals,
    });
  } catch (error) {
    console.error('Reveal lookup failed:', error.message);
    res.status(503).json({ message: 'The match details are unavailable right now.' });
  }
});

let warmupReadyPromise = null;
function prepareWarmupQuestions() {
  if (!warmupReadyPromise) {
    warmupReadyPromise = ensureWarmupQuestions(pool, schema)
      .then((result) => {
        console.log(`[Warmup] ${result.count} questions ${result.rebuilt ? 'built' : 'ready'}.`);
        return result;
      })
      .catch((error) => {
        warmupReadyPromise = null;
        console.error('[Warmup] Questions could not be prepared:', error.message);
        throw error;
      });
  }
  return warmupReadyPromise;
}

// Warmup: record questions are materialised by warmupQuestions.mjs. The answer
// and detail are deliberately absent from this response.
app.get('/api/warmup', async (req, res) => {
  try {
    await prepareWarmupQuestions();
    const rawExclude = typeof req.query.exclude === 'string' ? req.query.exclude : '';
    const excluded = [...new Set(
      rawExclude
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0)
    )].slice(-20);
    const { rows } = await pool.query(`
      SELECT id, type, question_text AS question
      FROM ${schema}.warmup_question
      WHERE NOT (id = ANY($1::int[]))
      ORDER BY random()
      LIMIT 1
    `, [excluded]);
    if (!rows[0]) {
      return res.status(404).json({ message: 'No new question is available right now. Try again.' });
    }
    res.set('Cache-Control', 'no-store').json(rows[0]);
  } catch (error) {
    console.error('Warmup question lookup failed:', error.message);
    res.status(503).json({ message: 'The archive is unavailable right now.' });
  }
});

app.post('/api/warmup/:id/reveal', async (req, res) => {
  try {
    const questionId = Number(req.params.id);
    if (!Number.isSafeInteger(questionId) || questionId <= 0) {
      return res.status(400).json({ message: 'Invalid question ID.' });
    }
    await prepareWarmupQuestions();
    const { rows } = await pool.query(
      `SELECT answer, detail FROM ${schema}.warmup_question WHERE id = $1`,
      [questionId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'That question could not be found.' });
    res.set('Cache-Control', 'no-store').json(rows[0]);
  } catch (error) {
    console.error('Warmup reveal failed:', error.message);
    res.status(503).json({ message: 'The answer is unavailable right now.' });
  }
});

if (!production) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);
  app.use(async (_req, res, next) => {
    try {
      const html = await vite.transformIndexHtml('/', readFileSync(path.join(root, 'index.html'), 'utf8'));
      res.status(200).type('html').send(html);
    } catch (error) { next(error); }
  });
} else {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}

const port = Number(process.env.PORT || 5173);
void prepareWarmupQuestions().catch(() => {});
app.listen(port, () => console.log(`Hindsight listening on http://localhost:${port}`));
