import { test, expect } from '@playwright/test';

test('interactive simulator sends the selected CC and stops cleanly', async ({ page }) => {
  await page.addInitScript(() => {
    const messages: number[][] = [];
    const port = { id: 'virtual-test', name: 'Test DAW port', state: 'connected', open: async () => {}, send: (bytes: number[]) => messages.push(bytes), clear: () => {} };
    const access = { outputs: new Map([[port.id, port]]), onstatechange: null as null | (() => void) };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
    Object.defineProperty(window, 'testMidiMessages', { value: messages });
  });
  await page.goto('/vision');
  await expect(page.getByRole('heading', { name: /Light\. Motion\./ })).toBeVisible();
  await page.getByRole('button', { name: 'Start MIDI output' }).click();
  await page.locator('#midi-output').selectOption('virtual-test');
  await page.getByRole('button', { name: 'Start repeatable sweep' }).click();
  await page.getByRole('button', { name: 'Start MIDI output' }).click();
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  await expect.poll(() => page.evaluate(() => (window as unknown as { testMidiMessages: number[][] }).testMidiMessages.length)).toBeGreaterThan(2);
  const firstMessage = await page.evaluate(() => (window as unknown as { testMidiMessages: number[][] }).testMidiMessages[0]);
  expect(firstMessage[0]).toBe(0xb0);
  expect(firstMessage[1]).toBe(74);
  expect(firstMessage[2]).toBeGreaterThanOrEqual(0);
  expect(firstMessage[2]).toBeLessThanOrEqual(127);
  await expect(page.getByRole('button', { name: /Learn/i })).toHaveCount(0);
  await expect(page.getByText(/You can use one CC for multiple parameters/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop MIDI output' }).click();
  await expect(page.locator('#midi-state')).toHaveText('STOPPED');
  const stoppedCount = await page.evaluate(() => (window as unknown as { testMidiMessages: number[][] }).testMidiMessages.length);
  await page.waitForTimeout(150);
  await expect.poll(() => page.evaluate(() => (window as unknown as { testMidiMessages: number[][] }).testMidiMessages.length)).toBe(stoppedCount);
  expect(await page.locator('#diagnostics').textContent()).toContain('repeatable sweep running');
});

test('camera remains a live input for the same MIDI output path', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const messages: number[][] = [];
    const port = { id: 'virtual-camera', name: 'Camera DAW port', state: 'connected', open: async () => {}, send: (bytes: number[]) => messages.push(bytes), clear: () => {} };
    const access = { outputs: new Map([[port.id, port]]), onstatechange: null as null | (() => void) };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
    Object.defineProperty(window, 'cameraMidiMessages', { value: messages });
  });
  await page.goto('/vision');
  await page.locator('#source').selectOption('camera');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('#input-state')).toHaveText('CAMERA LIVE');
  await expect(page.locator('#camera-status')).toContainText('Camera live');
  await expect.poll(() => page.locator('#signal-value').textContent()).not.toBe('0.000');
  await page.getByRole('button', { name: 'Start MIDI output' }).click();
  await page.locator('#midi-output').selectOption('virtual-camera');
  await page.getByRole('button', { name: 'Start MIDI output' }).click();
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  await expect.poll(() => page.evaluate(() => (window as unknown as { cameraMidiMessages: number[][] }).cameraMidiMessages.length)).toBeGreaterThan(0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1200);
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  expect(await page.locator('#video').evaluate(video => (video as HTMLVideoElement).srcObject !== null)).toBeTruthy();
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect(page.locator('#midi-state')).toHaveText('STOPPED');
  await expect(page.locator('#camera-status')).toContainText('Camera stopped');
  await context.close();
});

test('camera and simulator switch cleanly while the MIDI route stays explicit', async ({ page }) => {
  await page.goto('/vision');
  await expect(page.locator('#simulator-panel')).toBeVisible();
  await expect(page.locator('#camera-panel')).toBeHidden();
  await page.locator('#source').selectOption('camera');
  await expect(page.locator('#camera-panel')).toBeVisible();
  await expect(page.locator('#simulator-panel')).toBeHidden();
  await page.locator('#source').selectOption('simulator');
  await expect(page.locator('#simulator-panel')).toBeVisible();
  await expect(page.getByText(/Only applications connected to the selected MIDI port/)).toBeVisible();
});
