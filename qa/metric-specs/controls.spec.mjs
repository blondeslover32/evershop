import { test, expect } from '@playwright/test';

async function addToCheckout(page, path, { quantity = 1, variant = false } = {}) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (variant) {
    await page.getByRole('button', { name: 'White', exact: true }).click();
    await page.waitForURL(url => url.searchParams.has('color'));
    await expect(page.locator('.variant-option-list > li.selected').getByRole('button', { name: 'White', exact: true })).toBeVisible();
  }
  await page.getByRole('spinbutton', { name: 'Quantity' }).fill(String(quantity));
  const result = page.waitForResponse(response => response.request().method() === 'POST' && /\/cart\/mine\/items(?:\?|$)/.test(response.url()));
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  expect((await result).ok()).toBeTruthy();
  await page.getByRole('dialog', { name: 'Your Cart' }).getByRole('button', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
}

test('#964 unavailable White/L variant is disabled', async ({ page }, testInfo) => {
  await page.goto('/qa-metric-shirt-white-xl');
  await expect(page.getByRole('heading', { name: 'Metric Tee White XL', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await page.waitForURL(url => url.searchParams.has('color'));
  await expect(page.locator('.variant-option-list > li.selected').getByRole('button', { name: 'White', exact: true })).toBeVisible();
  const unavailable = page.getByRole('button', { name: 'L', exact: true });
  await testInfo.attach('variant-tree', { body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain' });
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toBeDisabled();
});

test('#934 virtual billing can select Canada outside US shipping zones', async ({ page }, testInfo) => {
  await addToCheckout(page, '/qa-metric-virtual-guide');
  const country = page.getByRole('combobox', { name: /Country/ });
  await expect(country).toBeVisible();
  await country.click();
  const canada = page.getByRole('option', { name: 'Canada', exact: true });
  await expect(canada).toBeVisible();
  await canada.click();
  await expect(country).toContainText('Canada');
  await testInfo.attach('billing-tree', { body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain' });
});

test('#683 qualifying tax-inclusive subtotal accepts the threshold coupon', async ({ page }, testInfo) => {
  await addToCheckout(page, '/ceramic-coffee-cup-white', { quantity: 3, variant: true });
  const field = page.getByRole('textbox', { name: 'Enter coupon code' });
  await field.fill('QA-METRIC-40');
  const result = page.waitForResponse(response => response.request().method() === 'POST' && /\/coupons(?:\?|$)/.test(response.url()));
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const response = await result;
  await testInfo.attach('coupon-response', { body: JSON.stringify({ status: response.status(), body: await response.json() }), contentType: 'application/json' });
  const summary = page.locator('.cart__total__summary').filter({ visible: true });
  await expect(summary.getByText('Discount(QA-METRIC-40)', { exact: true })).toBeVisible();
  await expect(summary).toContainText('$5.00');
  await expect(summary.locator('.grand-total')).toContainText('$40.00');
  await testInfo.attach('coupon-tree', { body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain' });
});
