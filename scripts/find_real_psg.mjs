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

const queries = ['Real Madrid', 'Saint-Germain', 'Olympique Lyon'];
for (const q of queries) {
  const { rows } = await pool.query(`
    SELECT id, name, stadium_name
    FROM core.club
    WHERE name ILIKE $1
    ORDER BY name
    LIMIT 6
  `, [`%${q}%`]);
  console.log(`=== Query: "${q}" ===`);
  rows.forEach(r => console.log(`  ID ${r.id}: ${r.name} (${r.stadium_name || 'no stadium'})`));
}
await pool.end();
