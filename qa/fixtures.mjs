// Installed as qa/fixtures.mjs in an isolated metric source checkout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

assert.match(process.env.DB_NAME || '', /^(?:evershop_)?metric_/, 'Refuse to modify a non-metric database');
const base = spawnSync(process.execPath, ['qa/store-fixtures.mjs'], { stdio: 'inherit', env: process.env });
assert.equal(base.status, 0, 'Base store fixture failed');
const load = (file) => import(pathToFileURL(resolve('packages/evershop/dist', file)).href);
const { pool } = await load('lib/postgres/connection.js');
const { default: createProduct } = await load('modules/catalog/services/product/createProduct.js');
const { loadSeedAttributes, createVariantGroups, resolveAttributeOptions } = await load('bin/seed/variantGroupHelpers.js');
const { seedSamplePackage } = await load('bin/seed/seedPackages.js');

try {
  const { rows: [group] } = await pool.query(`SELECT attribute_group_id FROM attribute_group WHERE group_name = 'Demo Products'`);
  assert.ok(group, 'Run unattended catalog seed before metric fixtures');
  const packageRow = await seedSamplePackage();
  const common = { type: 'simple', visibility: true, status: true, price: 15, weight: 0.1, qty: 100, manage_stock: true, stock_availability: true, description: [] };
  const variants = [
    { ...common, sku: 'QA-METRIC-WHITE-XL', name: 'Metric Tee White XL', url_key: 'qa-metric-shirt-white-xl', variant_group: 'qa-metric-shirt', attributes: [{ attribute_code: 'color', value: 'White' }, { attribute_code: 'size', value: 'XL' }] },
    { ...common, sku: 'QA-METRIC-WHITE-XXL', name: 'Metric Tee White XXL', url_key: 'qa-metric-shirt-white-xxl', variant_group: 'qa-metric-shirt', attributes: [{ attribute_code: 'color', value: 'White' }, { attribute_code: 'size', value: 'XXL' }] },
    { ...common, sku: 'QA-METRIC-BLACK-L', name: 'Metric Tee Black L', url_key: 'qa-metric-shirt-black-l', variant_group: 'qa-metric-shirt', attributes: [{ attribute_code: 'color', value: 'Black' }, { attribute_code: 'size', value: 'L' }] }
  ];
  const attributesData = JSON.parse(readFileSync('packages/evershop/dist/bin/seed/data/attributes.json', 'utf8'));
  const attributes = await loadSeedAttributes(attributesData);
  const groups = await createVariantGroups(variants, group.attribute_group_id, attributes);
  for (const variant of variants) {
    const { rows } = await pool.query('SELECT 1 FROM product WHERE sku=$1', [variant.sku]);
    if (rows.length) continue;
    const data = { ...variant, group_id: group.attribute_group_id, package_id: packageRow.package_id, variant_group_id: groups.get(variant.variant_group), attributes: await resolveAttributeOptions(variant.attributes) };
    delete data.variant_group;
    await createProduct(data, {});
  }
  const { rows: virtualExists } = await pool.query(`SELECT 1 FROM product WHERE sku='QA-METRIC-VIRTUAL'`);
  if (!virtualExists.length) await createProduct({ ...common, sku: 'QA-METRIC-VIRTUAL', name: 'Metric Virtual Guide', url_key: 'qa-metric-virtual-guide', group_id: group.attribute_group_id, no_shipping_required: true, price: 10, weight: 0 }, {});
  // Keep all three scenarios discoverable from the real homepage for browser agents.
  const { rows: [homepage] } = await pool.query(`SELECT collection_id FROM collection WHERE code='homepage'`);
  assert.ok(homepage, 'Seeded homepage collection is required');
  await pool.query('DELETE FROM product_collection WHERE collection_id=$1', [homepage.collection_id]);
  await pool.query(`INSERT INTO product_collection(collection_id,product_id)
    SELECT $1,product_id FROM product WHERE sku LIKE 'QA-METRIC-%' OR sku='CUP-001-WHT'`, [homepage.collection_id]);
  for (const [name, value] of Object.entries({ priceIncludingTax: '1', addressDefaultCountry: 'US' })) {
    await pool.query(`INSERT INTO setting(name,value,is_json) VALUES($1,$2,false) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value,is_json=false`, [name, value]);
  }
  await pool.query(`INSERT INTO setting(name,value,is_json) VALUES('addressSellToCountries',$1,true)
    ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value,is_json=true`, [JSON.stringify('all')]);
  await pool.query(`DELETE FROM setting WHERE name='addressSettings'`);
  await pool.query(`INSERT INTO coupon(description,discount_amount,discount_type,coupon,condition,user_condition,target_products)
    VALUES('Metric subtotal threshold',5,'fixed_discount_to_entire_order','QA-METRIC-40','{"order_total":"40"}','{"group":false}','{}')
    ON CONFLICT(coupon) DO UPDATE SET status=true,discount_amount=5,condition=EXCLUDED.condition,user_condition=EXCLUDED.user_condition`);
  const { rows: products } = await pool.query(`SELECT p.sku,p.no_shipping_required,p.variant_group_id,d.url_key FROM product p
    JOIN product_description d ON d.product_description_product_id=p.product_id WHERE sku LIKE 'QA-METRIC-%' ORDER BY sku`);
  assert.equal(products.length, 4, 'Expected three sparse variants and one virtual product');
  console.log(JSON.stringify({ phase: 'metric-fixtures', database: process.env.DB_NAME, products, shippingCountries: ['US'], billingCountries: 'all', priceIncludingTax: true, coupon: { code: 'QA-METRIC-40', minimumSubtotal: 40, amount: 5 } }, null, 2));
} finally { await pool.end(); }
