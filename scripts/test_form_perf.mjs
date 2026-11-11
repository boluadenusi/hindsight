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

const t0 = Date.now();
const { rows: form } = await pool.query(`
  SELECT g.id, to_char(g.game_date, 'YYYY-MM-DD') AS game_date,
    c_home.name AS home_name, c_away.name AS away_name, comp.name AS competition_name,
    CASE 
      WHEN (g.home_club_id = $1 AND g.home_goals > g.away_goals) OR (g.away_club_id = $1 AND g.away_goals > g.home_goals) THEN 'W'
      WHEN g.home_goals = g.away_goals THEN 'D'
      ELSE 'L'
    END AS result,
    CASE WHEN g.home_club_id = $1 THEN 'H' ELSE 'A' END AS venue,
    CASE WHEN g.home_club_id = $1 THEN c_away.name ELSE c_home.name END AS opponent,
    CASE WHEN g.home_club_id = $1 THEN CONCAT(g.home_goals, '-', g.away_goals) ELSE CONCAT(g.away_goals, '-', g.home_goals) END AS score
  FROM core.game g
  JOIN core.club c_home ON c_home.id = g.home_club_id
  JOIN core.club c_away ON c_away.id = g.away_club_id
  JOIN core.competition comp ON comp.id = g.competition_id
  WHERE (g.home_club_id = $1 OR g.away_club_id = $1)
    AND g.game_date < '2020-12-17'::date
    AND g.home_goals IS NOT NULL AND g.away_goals IS NOT NULL
  ORDER BY g.game_date DESC, g.id DESC
  LIMIT 5
`, [164]);
const elapsed = Date.now() - t0;
console.log(`Query took ${elapsed}ms:`, form);
await pool.end();
