// Inspect distinct lineup positions and game.round values to design the formation layout.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const schema = (process.env.DATABASE_SCHEMA || 'core').replace(/[^a-zA-Z0-9_]/g, '');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });

try {
  const positions = await pool.query(
    `SELECT position, count(*) AS n FROM ${schema}.lineup WHERE type = 'starting' GROUP BY position ORDER BY n DESC`
  );
  console.log('--- distinct starting positions ---');
  for (const row of positions.rows) console.log(String(row.n).padStart(8), row.position);

  const rounds = await pool.query(
    `SELECT round, count(*) AS n FROM ${schema}.game GROUP BY round ORDER BY n DESC LIMIT 40`
  );
  console.log('\n--- distinct round values ---');
  for (const row of rounds.rows) console.log(String(row.n).padStart(8), JSON.stringify(row.round));

  const formations = await pool.query(
    `SELECT home_formation AS f, count(*) AS n FROM ${schema}.game GROUP BY home_formation ORDER BY n DESC LIMIT 30`
  );
  console.log('\n--- distinct formations ---');
  for (const row of formations.rows) console.log(String(row.n).padStart(8), JSON.stringify(row.f));
} finally {
  await pool.end();
}
