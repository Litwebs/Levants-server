const { test, expect } = require('@playwright/test');
const user = { _id: 'admin-test', id: 'admin-test', name: 'Admin', email: 'admin@example.test', role: { name: 'admin', permissions: ['*'] }, preferences: { theme: 'dark' } };
async function mock(page, handler) {
  await page.addInitScript(() => localStorage.setItem('levants:theme', 'dark'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (handler && await handler(route, url)) return;
    let data = {};
    if (url.pathname.endsWith('/auth/authenticated')) data = { authenticated: true, user };
    else if (url.pathname.endsWith('/auth/me')) data = { user };
    else if (url.pathname.endsWith('/admin/products')) data = { products: [{ _id: 'milk', name: 'Organic whole milk large family bottle', slug: 'organic-whole-milk', category: 'Dairy', status: 'active', variants: [] }] };
    else if (url.pathname.includes('/subscriptions')) data = { subscriptions: [], meta: { total: 0 } };
    else if (url.pathname.includes('/discounts')) data = { discounts: [] };
    else if (url.pathname.includes('/orders')) data = { orders: [] };
    await route.fulfill({ json: { success: true, data, meta: { total: url.pathname.endsWith('/admin/products') ? 1 : 0, totalPages: 1, categories: ['Dairy'] } } });
  });
}
test('dark palette is applied before application scripts load', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mock(page);
  await page.route('**/assets/*.js', route => route.abort());
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(15, 15, 17)');
});
for (const name of ['Orders', 'Subscriptions', 'Discounts']) {
  test(`${name} uses shared loading, refresh and filter controls`, async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await mock(page, async (route, url) => {
      if (url.pathname.endsWith('/' + name.toLowerCase())) {
        await gate;
        const key = name.toLowerCase();
        await route.fulfill({ json: { success: true, data: { [key]: [], meta: { total: 0 } }, meta: { total: 0, totalPages: 1 } } });
        return true;
      }
      return false;
    });
    await page.goto('/' + name.toLowerCase());
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
    await expect(page.locator('table[aria-busy="true"] tbody tr')).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[id$="filters-panel"]')).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `test-results/${name.toLowerCase()}-dark.png`, fullPage: true });
  });
}
test('discount search and filters reach the API and refresh preserves them', async ({ page }) => {
  await mock(page);
  await page.goto('/discounts');
  await page.getByRole('textbox', { name: 'Search discounts', exact: true }).fill('MILK');
  await expect.poll(() => page.getByRole('button', { name: 'Refresh', exact: true }).isEnabled()).toBe(true);
  const request = page.waitForRequest(r => r.url().includes('/admin/discounts?') && new URL(r.url()).searchParams.get('search') === 'MILK');
  await request;
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Status', { exact: true }).selectOption('active');
  const refresh = page.waitForRequest(r => r.url().includes('/admin/discounts?') && new URL(r.url()).searchParams.get('status') === 'active');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await refresh;
});
for (const width of [390, 768]) {
  test(`products retain all columns without wrapping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mock(page);
    await page.goto('/products');
    const region = page.getByRole('region', { name: 'Products table' });
    await expect(region.getByText('Organic whole milk large family bottle', { exact: true })).toBeVisible();
    await expect(region.locator('th')).toHaveCount(7);
    for (const cell of await region.locator('th').all()) await expect(cell).toBeVisible();
    expect(await region.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await region.locator('td').first().evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(region.getByRole('button', { name: /Edit Organic/ }).filter({ visible: true })).toHaveCount(1);
    await page.screenshot({ path: `test-results/products-${width}.png`, fullPage: true });
  });
}

test('login follows system theme changes without reloading', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('levants:theme', 'system'));
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: { authenticated: false } } }));
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 15, 17)');
  await page.screenshot({ path: 'test-results/login-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
  await page.screenshot({ path: 'test-results/login-light.png', fullPage: true });
});
