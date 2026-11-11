import pg from 'pg';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const TOP_5_LEAGUE_IDS = [30, 24, 37, 34, 28];
const BIG_CLUB_IDS = new Set([
  790, 334, 369, 51, 624, 155, // Premier League
  498, 119, 115,               // La Liga
  314, 168, 157, 263,          // Bundesliga
  554, 526, 549, 88, 618,      // Serie A
  592, 279, 20, 169            // Ligue 1
]);

const { rows: candidates } = await pool.query(`
  SELECT g.id, g.home_club_id, g.away_club_id
  FROM core.game g
  JOIN core.competition competition ON competition.id = g.competition_id
  JOIN core.club home ON home.id = g.home_club_id
  JOIN core.club away ON away.id = g.away_club_id
  JOIN (
    SELECT l.game_id,
      count(DISTINCT l.player_id) FILTER (WHERE l.club_id = g.home_club_id AND p.name IS NOT NULL) AS home_count,
      count(DISTINCT l.player_id) FILTER (WHERE l.club_id = g.away_club_id AND p.name IS NOT NULL) AS away_count
    FROM core.lineup l
    JOIN core.game g ON g.id = l.game_id
    JOIN core.player p ON p.id = l.player_id
    WHERE l.type = 'starting'
    GROUP BY l.game_id, g.home_club_id, g.away_club_id
  ) starters ON starters.game_id = g.id
  WHERE g.competition_id = ANY($1::int[])
    AND g.game_date IS NOT NULL AND competition.name IS NOT NULL
    AND home.name IS NOT NULL AND away.name IS NOT NULL
    AND starters.home_count = 11 AND starters.away_count = 11
`, [TOP_5_LEAGUE_IDS]);

const ids = candidates.map(c => c.id);
console.log(`Found ${ids.length} candidate fixtures with complete lineups in top 5 leagues.`);

const { rows: games } = await pool.query(
  `SELECT id, home_club_id, away_club_id, home_goals, away_goals FROM core.game WHERE id = ANY($1::int[])`,
  [ids]
);
const { rows: goals } = await pool.query(
  `SELECT e.game_id, e.club_id, e.player_id, p.name AS player_name 
   FROM core.event e 
   LEFT JOIN core.player p ON p.id = e.player_id 
   WHERE e.type = 'Goals' AND e.game_id = ANY($1::int[])`,
  [ids]
);

const gameById = new Map(games.map(g => [g.id, g]));
const goalsByGame = new Map();
for (const goal of goals) {
  const game = gameById.get(goal.game_id);
  if (!game) continue;
  let tally = goalsByGame.get(goal.game_id);
  if (!tally) {
    tally = { total: 0, home: 0, away: 0, named: true };
    goalsByGame.set(goal.game_id, tally);
  }
  tally.total += 1;
  if (goal.club_id === game.home_club_id) tally.home += 1;
  else if (goal.club_id === game.away_club_id) tally.away += 1;
  if (!goal.player_id || !goal.player_name || (goal.club_id !== game.home_club_id && goal.club_id !== game.away_club_id)) tally.named = false;
}

const eligibleTiers = { A: [], B: [], C: [] };
for (const g of candidates) {
  const game = gameById.get(g.id);
  const tally = goalsByGame.get(g.id) ?? { total: 0, home: 0, away: 0, named: true };
  const isComplete = game.home_goals !== null && game.away_goals !== null
    && tally.home === game.home_goals && tally.away === game.away_goals
    && tally.total === game.home_goals + game.away_goals && tally.named;

  if (isComplete) {
    const homeBig = BIG_CLUB_IDS.has(g.home_club_id);
    const awayBig = BIG_CLUB_IDS.has(g.away_club_id);
    if (homeBig && awayBig) eligibleTiers.A.push(g.id);
    else if (homeBig || awayBig) eligibleTiers.B.push(g.id);
    else eligibleTiers.C.push(g.id);
  }
}

console.log(`Eligible complete fixtures:`);
console.log(`Tier A (Both big clubs): ${eligibleTiers.A.length}`);
console.log(`Tier B (One big club): ${eligibleTiers.B.length}`);
console.log(`Tier C (Neither big club): ${eligibleTiers.C.length}`);
console.log(`Total Top 5 League eligible fixtures: ${eligibleTiers.A.length + eligibleTiers.B.length + eligibleTiers.C.length}`);

await pool.end();
