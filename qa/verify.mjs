import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
assert.match(process.env.DB_NAME || '', /^(?:evershop_)?metric_/);
assert.equal(spawnSync(process.execPath, ['qa/store-verify.mjs'], { stdio: 'inherit', env: process.env }).status, 0);
const load = (file) => import(pathToFileURL(resolve('packages/evershop/dist', file)).href);
const { pool } = await load('lib/postgres/connection.js');
const { refreshSetting } = await load('modules/setting/services/setting.js');
const { getPriceIncludingTax } = await load('modules/tax/services/taxSettings.js');
const { getAddressSettings } = await load('modules/base/services/address/getAddressSettings.js');
try {
  await refreshSetting();
  assert.equal(getPriceIncludingTax(), true);
  const address = getAddressSettings();
  assert.equal(address.defaultCountry, 'US');
  assert.equal(address.sellToCountries, 'all');
  const { rows: [coupon] } = await pool.query(`SELECT coupon,discount_amount,condition FROM coupon WHERE coupon='QA-METRIC-40'`);
  assert.equal(Number(coupon.discount_amount), 5);
  assert.equal(Number(coupon.condition.order_total), 40);
  const { rows: [virtual] } = await pool.query(`SELECT no_shipping_required FROM product WHERE sku='QA-METRIC-VIRTUAL'`);
  assert.equal(virtual.no_shipping_required, true);
  const { rows: variants } = await pool.query(`SELECT sku,variant_group_id FROM product WHERE sku LIKE 'QA-METRIC-%' AND variant_group_id IS NOT NULL`);
  assert.equal(variants.length, 3);
  assert.equal(new Set(variants.map(row => row.variant_group_id)).size, 1);
  console.log(JSON.stringify({ phase: 'metric-verify', database: process.env.DB_NAME, priceIncludingTax: true, sellToCountries: 'all', shippingCountries: ['US'], virtual: true, sparseVariants: variants.length, coupon }, null, 2));
} finally { await pool.end(); }
