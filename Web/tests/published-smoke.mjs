import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const url = process.env.BASE_URL || 'https://setcarlight.vercel.app';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, timeout: 45000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  assert.equal(new URL(response.url()).protocol, 'https:');
  assert.ok(response.headers()['content-security-policy']);
  for (const path of ['/package.json', '/vercel.json', '/README.md', '/tests/reference-fixtures.json']) {
    const hidden = await context.request.get(new URL(path, url).href);
    assert.equal(hidden.status(), 404, `${path} must not be public`);
  }
  await page.locator('#toggle-horizontal').check();
  await page.locator('#field-rightFront').fill('5020');
  assert.equal(await page.locator('#field-bumperFront').isVisible(), false);
  await page.locator('#toggle-measureCorner').check();
  assert.match(await page.locator('#angle-comparison').textContent(), /Разница: 0,82°/);
  await page.locator('#copy').click();
  await page.locator('#toast').waitFor({ state: 'visible' });
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Комментарий:.*Разница: 0,82°/);
  await page.locator('input[name="cornerSource"][value="triangle"]').check();
  assert.equal(await page.locator('#field-bumperFront').isVisible(), true);
  assert.match(await page.locator('#angle-comparison').textContent(), /используется угол по треугольнику/);
  assert.match(await page.locator('#print-report').textContent(), /Разница: 0,82°/);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('input[name="cornerSource"][value="triangle"]').isChecked(), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', url, https: true, methods: true, comparison: true, clipboard: true, persistence: true, csp: true }));
  await context.close();
} finally { await browser.close(); }
