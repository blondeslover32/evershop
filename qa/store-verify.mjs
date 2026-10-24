// Validate the real seeded store using its compiled DB/config/shipping code.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const load = (file) => import(pathToFileURL(resolve('packages/evershop/dist', file)).href);
const { pool } = await load('lib/postgres/connection.js');
const { getConfig } = await load('lib/util/getConfig.js');
const { getSetting } = await load('modules/setting/services/setting.js');
const { resolveZonesForAddress } = await load('modules/checkout/services/shipping/resolveZonesForAddress.js');
const { coreShippingProvider } = await load('modules/checkout/services/shipping/core/coreProvider.js');
try {
  const { rows: [counts] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM product WHERE status = true) AS products,
    (SELECT count(*)::int FROM category) AS categories,
    (SELECT count(*)::int FROM collection) AS collections,
    (SELECT count(*)::int FROM product_image) AS images`);
  for (const value of Object.values(counts)) assert.ok(value > 0, 'Missing seeded catalog data');
  const { rows: [product] } = await pool.query(`SELECT p.sku, i.qty, p.status, i.stock_availability
    FROM product p JOIN product_inventory i ON i.product_inventory_product_id = p.product_id
    WHERE p.sku = 'CUP-001-WHT'`);
  assert.ok(product?.status && product.stock_availability && product.qty >= 3, 'Test product unavailable');
  assert.equal(String(await getSetting('codPaymentStatus', '0')), '1', 'COD must be enabled');
  assert.equal(getConfig('checkout.showShippingNote', false), true, 'showShippingNote must be true');
  const zones = await resolveZonesForAddress({ country: 'US', administrativeArea: 'US-CA', postalCode: '95014' });
  let quote;
  for (const zone of zones) {
    const { rows: attachments } = await pool.query(`SELECT 1 FROM shipping_zone_provider
      WHERE zone_id = $1 AND provider_code = 'core' AND is_enabled = true`, [zone.shipping_zone_id]);
    if (!attachments.length) continue;
    const methods = await coreShippingProvider.getMethods({ zone, totalWeight: 900, totalValue: 45, currency: 'USD', items: [], origin: {}, destination: { country: 'US', administrative_area: 'US-CA' }, zoneConfig: {}, providerConfig: {} });
    quote = methods.find(method => method.name === 'QA Standard Shipping' && method.cost === 5);
    if (quote) break;
  }
  assert.ok(quote, 'Real shipping provider must return QA Standard Shipping for US-CA');
  console.log(JSON.stringify({ phase: 'verify', ...counts, product, cod: true, showShippingNote: true, shippingQuote: quote }, null, 2));
} finally { await pool.end(); }
