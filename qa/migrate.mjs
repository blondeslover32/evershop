// Run from the root of a compiled EverShop source checkout.
// Adapted from upstream dev 3c405266 scripts/ci/migrateCoreSchema.mjs.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.SUPPRESS_NO_CONFIG_WARNING = '1';
const dist = resolve('packages/evershop/dist');
const load = (file) => import(pathToFileURL(resolve(dist, file)).href);
const { getCoreModules } = await load('bin/lib/loadModules.js');
const { migrate } = await load('bin/lib/bootstrap/migrate.js');
const { pool } = await load('lib/postgres/connection.js');
let verified = false;
// Upstream migrate() exits zero on errors. Convert that early exit to failure.
process.on('exit', () => { if (!verified) process.exitCode = 1; });
await migrate(getCoreModules());
const { rows: [schema] } = await pool.query(`
  SELECT count(*)::int AS tables FROM information_schema.tables
  WHERE table_schema = 'public'
`);
for (const table of ['product', 'setting', 'cart', 'order', 'core_shipping_method_rate']) {
  await pool.query(`SELECT 1 FROM "${table}" LIMIT 1`);
}
if (schema.tables < 50) throw new Error(`Incomplete schema: ${schema.tables} tables`);
verified = true;
console.log(JSON.stringify({ phase: 'migrate', tables: schema.tables }));
// Upstream migrations keep a checked-out connection.
process.exit(0);
