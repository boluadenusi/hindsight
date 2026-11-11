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

// Check distinct lineup types
const { rows: lineupTypes } = await pool.query(`SELECT DISTINCT type FROM core.lineup`);
console.log('Lineup types:', lineupTypes);

// Check distinct formations and positions
const { rows: formations } = await pool.query(`SELECT home_formation, count(*) FROM core.game WHERE home_formation IS NOT NULL GROUP BY home_formation ORDER BY count DESC LIMIT 15`);
console.log('Top formations:', formations);

const { rows: positions } = await pool.query(`SELECT position, count(*) FROM core.lineup WHERE position IS NOT NULL GROUP BY position ORDER BY count DESC LIMIT 20`);
console.log('Top positions:', positions);

// Check sample game for substitutes and form
const { rows: sampleGame } = await pool.query(`
  SELECT id, game_date, home_club_id, away_club_id, home_formation, away_formation
  FROM core.game
  WHERE home_formation IS NOT NULL AND away_formation IS NOT NULL
  LIMIT 1
`);
console.log('Sample game:', sampleGame[0]);

if (sampleGame[0]) {
  const g = sampleGame[0];
  const { rows: subs } = await pool.query(`
    SELECT l.club_id, l.type, l.position, l.shirt_number, p.id AS player_id, p.name
    FROM core.lineup l
    JOIN core.player p ON p.id = l.player_id
    WHERE l.game_id = $1 AND l.type != 'starting'
  `, [g.id]);
  console.log('Subs sample count:', subs.length, subs.slice(0, 4));

  // Form query for home team
  const { rows: form } = await pool.query(`
    SELECT g.id, g.game_date, g.home_club_id, g.away_club_id, g.home_goals, g.away_goals,
      c_home.name AS home_name, c_away.name AS away_name, comp.name AS competition_name
    FROM core.game g
    JOIN core.club c_home ON c_home.id = g.home_club_id
    JOIN core.club c_away ON c_away.id = g.away_club_id
    JOIN core.competition comp ON comp.id = g.competition_id
    WHERE (g.home_club_id = $1 OR g.away_club_id = $1)
      AND g.game_date < $2
      AND g.home_goals IS NOT NULL AND g.away_goals IS NOT NULL
    ORDER BY g.game_date DESC, g.id DESC
    LIMIT 5
  `, [g.home_club_id, g.game_date]);
  console.log('Home team form sample:', form);
}

await pool.end();
