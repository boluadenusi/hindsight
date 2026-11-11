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

// 1. Search competitions for top 5 leagues
const { rows: comps } = await pool.query(`
  SELECT id, name, source_id
  FROM core.competition
  WHERE name ILIKE '%premier%' OR name ILIKE '%liga%' OR name ILIKE '%bundesliga%' OR name ILIKE '%serie%' OR name ILIKE '%ligue%'
  ORDER BY name;
`);
console.log('Competitions matching top 5:');
console.log(comps);

// 2. Also check all competitions in core.game to see which ones are actually used
const { rows: usedComps } = await pool.query(`
  SELECT c.id, c.name, count(g.id) as game_count
  FROM core.competition c
  JOIN core.game g ON g.competition_id = c.id
  GROUP BY c.id, c.name
  ORDER BY game_count DESC;
`);
console.log('\nTop competitions by game count in database:');
console.log(usedComps.slice(0, 25));

await pool.end();
