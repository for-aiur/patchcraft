import { test, expect } from '@playwright/test';
test('synthetic worklet session, controls, report and restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Physical round-trip', {exact:true})).toBeVisible();
  await page.locator('#rate').selectOption('48000');
  await page.locator('#input').selectOption('sample');
  await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('LIVE');
  await expect(page.locator('#details')).toContainText('48000', { timeout: 10000 });
  await expect.poll(() => page.locator('#peak-value').textContent()).toContain('dBFS');
  await page.locator('#bypass').uncheck();
  await page.locator('#mute').check();
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  expect((await download).suggestedFilename()).toBe('patchcraft-local-report.json');
  await page.locator('#stop').click();
  await expect(page.locator('#state')).toHaveText('STOPPED');
  await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('LIVE');
  await page.locator('#stop').click();
  expect(errors).toEqual([]);
});
test('permission failure leaves controls recoverable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Microphone permission denied', 'NotAllowedError'));
  });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('Could not start');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#rate').selectOption('48000');
  await page.locator('#input').selectOption('sample');
  await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('LIVE');
});
test('fake microphone stream exercises capture and releases tracks', async ({ browser }) => {
  const context = await browser.newContext({permissions:['microphone']});
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#devices').click();
  await expect(page.locator('#status')).toContainText('Devices found');
  await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('LIVE');
  await expect.poll(() => page.locator('#peak-value').textContent()).toContain('dBFS');
  await page.locator('#stop').click();
  await expect(page.locator('#state')).toHaveText('STOPPED');
  await context.close();
});

test('cancelling pending capture does not interrupt a replacement session', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise((_resolve, reject) => {
      window.addEventListener('reject-capture', () => reject(new Error('Cancelled capture')), { once: true });
      document.documentElement.dataset.capturePending = 'true';
    });
  });
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('html')).toHaveAttribute('data-capture-pending', 'true');
  await page.locator('#stop').click();
  await page.locator('#input').selectOption('sample');
  await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('LIVE');
  await page.evaluate(() => window.dispatchEvent(new Event('reject-capture')));
  await expect(page.locator('#state')).toHaveText('LIVE');
  await expect(page.locator('#stop')).toBeEnabled();
});
