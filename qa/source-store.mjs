// Source-store lifecycle only; this is not the platform's QA runner.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, existsSync, symlinkSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const phase = process.argv[2];
const env = {
  DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_USER: 'evershop',
  DB_PASSWORD: 'evershop', DB_NAME: 'evershop', DB_SSLMODE: 'disable',
  PORT: '3000', SUPPRESS_NO_CONFIG_WARNING: '1',
  JWT_ADMIN_SECRET: 'demo-admin-secret-0123456789abcdef',
  JWT_ADMIN_REFRESH_SECRET: 'demo-admin-refresh-0123456789abcdef',
  JWT_CUSTOMER_SECRET: 'demo-customer-secret-0123456789abcdef',
  JWT_CUSTOMER_REFRESH_SECRET: 'demo-customer-refresh-0123456789abcdef',
  ...process.env
};
if (!env.NODE_CONFIG && existsSync('qa/store.config.json')) env.NODE_CONFIG = readFileSync('qa/store.config.json', 'utf8');
for (const folder of ['media', 'public']) mkdirSync(folder, { recursive: true });
const commands = {
  migrate: ['node', 'qa/migrate.mjs'],
  seed: ['npm', 'run', 'seed', '--', '--all'],
  fixtures: ['node', 'qa/fixtures.mjs'],
  verify: ['node', 'qa/verify.mjs'],
  build: ['node', 'packages/evershop/dist/bin/build/index.js'],
  start: ['node', 'packages/evershop/dist/bin/start/index.js']
};
if (!commands[phase]) throw new Error('Usage: node qa/source-store.mjs migrate|seed|fixtures|verify|build|start');
// npm install precedes compile, so npm cannot link the then-missing workspace bin.
if (phase === 'seed' && !existsSync('node_modules/.bin/evershop')) {
  mkdirSync('node_modules/.bin', { recursive: true });
  symlinkSync('../@evershop/evershop/dist/bin/evershop.js', 'node_modules/.bin/evershop');
}
if (['build', 'start'].includes(phase)) env.NODE_ENV = 'production';
const outputDir = resolve(process.env.QA_STORE_LOG_DIR || 'qa-artifacts');
mkdirSync(outputDir, { recursive: true });
const output = openSync(resolve(outputDir, `${phase}.log`), 'a');
const begin = Date.now();
const child = spawn(commands[phase][0], commands[phase].slice(1), { env, stdio: ['ignore', output, output] });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  let exitCode = code ?? 1;
  if (phase === 'build' && !['productView', 'checkout'].every(route =>
    existsSync(`.evershop/build/frontStore/${route}/client/index.json`))) exitCode = 1;
  console.log(JSON.stringify({ phase, exitCode, signal, durationMs: Date.now() - begin, log: resolve(outputDir, `${phase}.log`) }));
  process.exitCode = exitCode;
});
