import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(root, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

const schema = (process.env.DATABASE_SCHEMA || 'core').replace(/[^a-zA-Z0-9_]/g, '');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });

const config = JSON.parse(readFileSync(path.join(root, '..', 'config', 'fixtures.json'), 'utf8'));
const leagueIds = config.topFiveLeagues.map(l => l.id);

// First: what columns does competition have?
const { rows: cols } = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = $1 AND table_name = 'competition'
  ORDER BY ordinal_position
`, [schema]);
console.log('\n=== competition table columns ===');
for (const col of cols) console.log(`  ${col.column_name} (${col.data_type})`);

// Then: the five competitions in our pool
const { rows } = await pool.query(`
  SELECT comp.id, comp.name, COUNT(g.id) AS game_count
  FROM ${schema}.competition comp
  JOIN ${schema}.game g ON g.competition_id = comp.id
  WHERE comp.id = ANY($1::int[])
  GROUP BY comp.id, comp.name
  ORDER BY game_count DESC
`, [leagueIds]);
console.log('\n=== Competitions in eligible fixture pool ===');
for (const row of rows) console.log(`  [${row.id}] ${row.name} — ${row.game_count} games`);

// Then: sample all OTHER competitions in the DB
const { rows: others } = await pool.query(`
  SELECT comp.id, comp.name, COUNT(g.id) AS game_count
  FROM ${schema}.competition comp
  JOIN ${schema}.game g ON g.competition_id = comp.id
  WHERE comp.id != ALL($1::int[])
  GROUP BY comp.id, comp.name
  ORDER BY game_count DESC
  LIMIT 50
`, [leagueIds]);
console.log('\n=== Other competitions in database (sample top 50 by game count) ===');
for (const row of others) console.log(`  [${row.id}] ${row.name} — ${row.game_count} games`);

await pool.end();
