// Run after `npm run seed -- --all`, before building/starting the store.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { pool } = await import(pathToFileURL(resolve('packages/evershop/dist/lib/postgres/connection.js')).href);
const db = await pool.connect();
try {
  await db.query('BEGIN');
  for (const [name, value] of Object.entries({
    codPaymentStatus: '1', codDisplayName: 'Cash on Delivery',
    allowGuestCheckout: '1', storeName: 'EverShop QA Demo', storeCurrency: 'USD'
  })) {
    await db.query(`INSERT INTO setting (name, value, is_json) VALUES ($1, $2, false)
      ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, is_json = false`, [name, value]);
  }
  let { rows: [zone] } = await db.query(`SELECT shipping_zone_id FROM shipping_zone WHERE name = 'QA United States'`);
  if (!zone) ({ rows: [zone] } = await db.query(`INSERT INTO shipping_zone (name) VALUES ('QA United States') RETURNING shipping_zone_id`));
  const zoneId = zone.shipping_zone_id;
  await db.query(`INSERT INTO shipping_zone_country (zone_id, country) VALUES ($1, 'US') ON CONFLICT (zone_id, country) DO NOTHING`, [zoneId]);
  await db.query(`INSERT INTO shipping_zone_provider (zone_id, provider_code, is_enabled) VALUES ($1, 'core', true)
    ON CONFLICT (zone_id, provider_code) DO UPDATE SET is_enabled = true`, [zoneId]);
  const { rows: [method] } = await db.query(`INSERT INTO core_shipping_method (name, is_enabled, sort_order)
    VALUES ('QA Standard Shipping', true, 0) ON CONFLICT (name) DO UPDATE SET is_enabled = true RETURNING core_shipping_method_id`);
  await db.query(`INSERT INTO core_shipping_method_rate (method_id, zone_id, is_enabled, cost) VALUES ($1, $2, true, 5)
    ON CONFLICT (method_id, zone_id) DO UPDATE SET is_enabled = true, cost = 5`, [method.core_shipping_method_id, zoneId]);
  const { rows: products } = await db.query(`SELECT p.sku, pd.name, pd.url_key FROM product p
    JOIN product_description pd ON pd.product_description_product_id = p.product_id
    WHERE p.status = true ORDER BY p.product_id`);
  if (!products.length) throw new Error('Seed produced no active products');
  await db.query('COMMIT');
  console.log(JSON.stringify({ phase: 'fixtures', products, shipping: 'QA Standard Shipping', country: 'US', cost: 5, cod: true, showShippingNote: 'config checkout.showShippingNote=true' }, null, 2));
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  db.release();
  await pool.end();
}
