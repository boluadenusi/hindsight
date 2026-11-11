import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureWarmupQuestions } from '../warmupQuestions.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure it.');
}

const schema = (process.env.DATABASE_SCHEMA || 'core').replace(/[^a-zA-Z0-9_]/g, '');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  options: `-c search_path=${schema} -c max_parallel_workers_per_gather=0`,
});

try {
  const force = process.argv.includes('--force');
  const result = await ensureWarmupQuestions(pool, schema, { force, logger: console });
  const { rows } = await pool.query(`
    SELECT type, count(*)::int AS count
    FROM ${schema}.warmup_question
    GROUP BY type
    ORDER BY type
  `);
  console.log(
    `Warmup questions: ${result.count}${result.rebuilt ? ' (rebuilt)' : ' (already present)'}`
  );
  console.log(rows.map((row) => `${row.type}: ${row.count}`).join(' · '));
} finally {
  await pool.end();
}
