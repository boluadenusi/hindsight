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

const { rows: cols } = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = $1 AND table_name = 'game'
  ORDER BY ordinal_position
`, [schema]);
console.log('\n=== game table columns ===');
for (const c of cols) console.log(`  ${c.column_name} (${c.data_type})`);

// Sample a few games to see round/week values
const { rows: sample } = await pool.query(`SELECT * FROM ${schema}.game LIMIT 3`);
console.log('\n=== game sample rows ===');
console.log(JSON.stringify(sample, null, 2));

await pool.end();
