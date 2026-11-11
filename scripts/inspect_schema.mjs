import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const { rows: tables } = await pool.query(`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns 
  WHERE table_schema = 'core' 
  ORDER BY table_name, ordinal_position;
`);

const grouped = {};
for (const r of tables) {
  if (!grouped[r.table_name]) grouped[r.table_name] = [];
  grouped[r.table_name].push(`${r.column_name}: ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
}

console.log(JSON.stringify(grouped, null, 2));
await pool.end();
