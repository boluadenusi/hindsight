import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.dirname(fileURLToPath(import.meta.url));

async function runServer(t, { file, databaseUrl }) {
  const dir = mkdtempSync(path.join(root, '.server-env-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(path.join(root, 'server.mjs'), path.join(dir, 'server.mjs'));
  cpSync(path.join(root, 'warmupQuestions.mjs'), path.join(dir, 'warmupQuestions.mjs'));
  cpSync(path.join(root, 'config'), path.join(dir, 'config'), { recursive: true });
  if (file !== undefined) writeFileSync(path.join(dir, '.env'), file);

  const env = { ...process.env, PORT: '0' };
  delete env.DATABASE_URL;
  delete env.DATABASE_SCHEMA;
  delete env.DATABASE_SSL;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  const child = spawn(process.execPath, [path.join(dir, 'server.mjs'), '--production'], { env });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill(); });

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start or exit: ${output}`));
    }, 10000);
    child.stdout.on('data', () => {
      if (output.includes('Hindsight listening')) child.kill();
    });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

const unavailableDb = 'postgresql://test:test@127.0.0.1:1/test?connect_timeout=1';

test('starts with an environment variable and no .env file', async t => {
  const result = await runServer(t, { databaseUrl: unavailableDb });
  assert.match(result.output, /Hindsight listening/);
});

test('starts with DATABASE_URL from a local .env file', async t => {
  const result = await runServer(t, { file: `DATABASE_URL=${unavailableDb}\n` });
  assert.match(result.output, /Hindsight listening/);
});

test('environment variables take precedence over local .env values', async t => {
  const result = await runServer(t, { file: `DATABASE_URL=${unavailableDb}\nPORT=12345\n` });
  assert.match(result.output, /Hindsight listening on http:\/\/localhost:0/);
});

test('reports a missing DATABASE_URL when no .env file exists', async t => {
  const result = await runServer(t, {});
  assert.notEqual(result.code, 0);
  assert.match(result.output, /DATABASE_URL is missing/);
});
