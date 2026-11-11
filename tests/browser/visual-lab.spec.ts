import { test, expect } from '@playwright/test';

test('local visual lab previews image stages, offers a blank patch canvas and patch JSON round trips', async ({ page }) => {
  await page.goto('/visual-lab.html');
  await expect(page.locator('.site-brand')).toBeVisible();
  await page.getByText('Patch guide', { exact: true }).click();
  await expect(page.locator('#video-file')).toHaveAttribute('accept', 'video/*');
  await expect(page.getByLabel('Loop', { exact: true })).toBeChecked();
  await expect(page.locator('#preview')).toHaveAttribute('controls', '');
  await expect(page.locator('#recipe-select option')).toHaveCount(11);
  await expect(page.locator('#pipeline-stages .stage-card')).toHaveCount(4);
  await expect(page.locator('#pipeline-stages [data-stage-preview]')).toHaveCount(4);
  await expect(page.locator('#recipe-steps li')).toHaveCount(4);
  await expect(page.locator('#recipe-target')).not.toBeEmpty();
  await page.locator('#recipe-select').selectOption('color-focus');
  await expect(page.locator('#recipe-title')).toHaveText('Color Focus');
  await expect(page.locator('#midi-cc')).toHaveValue('20');
  await page.getByRole('button', { name: 'Add stage' }).click();
  await expect(page.locator('#pipeline-stages .stage-card')).toHaveCount(5);
  await page.locator('#recipe-select').selectOption('__blank');
  await expect(page.locator('#recipe-title')).toHaveText('Untitled patch');
  await expect(page.locator('#pipeline-stages .stage-card')).toHaveCount(0);
  await expect(page.getByText('Start with a clean image.')).toBeVisible();
  await page.getByLabel('Patch name').fill('Red motion test');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export patch' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('patchcraft-patch-red-motion-test.json');
  const path = await download.path();
  expect(path).toBeTruthy();
  const fs = await import('node:fs/promises');
  const imported = JSON.parse(await fs.readFile(path!, 'utf8'));
  expect(imported).toMatchObject({ schemaVersion: 1, name: 'Red motion test', image: { stages: [] } });
  await page.locator('#recipe-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(page.locator('#recipe-status')).toContainText('Unsupported recipe schema version');
  await expect(page.locator('#recipe-title')).toHaveText('Red motion test');
  await page.locator('#recipe-file').setInputFiles({ name: 'imported-demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.locator('#recipe-name')).toHaveValue('Red motion test');
  await expect(page.locator('#recipe-status')).toContainText('Patch imported');
  await expect(page.locator('#source-status')).toContainText('Video stays in this browser');
});

test('each image stage updates its own live preview from the same source frame', async ({ page }) => {
  await page.goto('/visual-lab.html');
  await page.getByRole('button', { name: 'Demo scene' }).click();
  await expect(page.locator('#pipeline-state')).toContainText('Analyzing', { timeout: 10_000 });
  await expect(page.locator('#pipeline-stages .stage-preview.has-frame')).toHaveCount(4);
  await expect(page.locator('#processed-preview')).toBeVisible();
});

test('every recipe processes live frames and produces finite raw and calibrated readings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('/visual-lab.html');
  const ids = await page.locator('#recipe-select option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(id => id !== '__blank'));
  for (const id of ids) {
    await page.locator('#recipe-select').selectOption(id);
    await page.getByRole('button', { name: 'Demo scene', exact: true }).click();
    const count = await page.locator('.stage-card').count();
    await expect(page.locator('.stage-preview.has-frame')).toHaveCount(count, { timeout: 15_000 });
    await expect(page.locator('#pipeline-state')).toContainText('Analyzing');
    await expect(page.locator('#signal-state')).toContainText('Signal connected');
    await expect(page.locator('[data-measurement-value]').first()).not.toHaveText('-');
    const value = Number(await page.locator('#control-knob').getAttribute('aria-valuenow'));
    expect(Number.isFinite(value), id).toBeTruthy();
    expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(127);
  }
  expect(errors).toEqual([]);
});

test('hidden-page control survives missing animation callbacks and temporary video stalls', async ({ page }) => {
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    const messages: number[][] = [];
    const port = { id: 'background-test', name: 'Background test', state: 'connected', open: async () => {}, send: (bytes: number[]) => messages.push(bytes), clear: () => {} };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ outputs: new Map([[port.id, port]]) }) });
    Object.assign(window, { backgroundMessages: messages });
  });
  const count = () => page.evaluate(() => (window as unknown as { backgroundMessages: number[][] }).backgroundMessages.length);
  await page.goto('/visual-lab.html');
  await page.locator('#recipe-select').selectOption('motion-pulse');
  await page.locator('#demo-start').click();
  await expect(page.locator('.stage-preview.has-frame')).not.toHaveCount(0);
  await page.locator('#add-cc-route').click();
  await expect(page.locator('.cc-route')).toHaveCount(1);
  await page.locator('#midi-toggle').click();
  await expect(page.locator('#midi-status')).toContainText('MIDI ports loaded');
  await page.locator('#midi-output').selectOption('background-test');
  await page.locator('#midi-toggle').click();
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  await expect.poll(count).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  await page.evaluate(() => (document.querySelector('#preview') as HTMLVideoElement).pause());
  await expect(page.locator('#midi-state')).toHaveText('Waiting for frames');
  const paused = await count();
  await page.waitForTimeout(700);
  expect(await count()).toBe(paused);
  await page.evaluate(() => (document.querySelector('#preview') as HTMLVideoElement).play());
  await expect(page.locator('#midi-state')).toHaveText('SENDING');
  await page.locator('#midi-toggle').click();
  const stopped = await count();
  await page.waitForTimeout(700);
  expect(await count()).toBe(stopped);
});

test('workspace export preserves CC destinations and restores MIDI disarmed', async ({ page }) => {
  await page.goto('/visual-lab.html');
  await page.locator('#recipe-select').selectOption('motion-pulse');
  await page.locator('#add-cc-route').click();
  const routes = page.locator('.cc-route');
  await expect(routes).toHaveCount(1);
  await routes.nth(0).locator('.route-cc').fill('21');
  await page.locator('#add-cc-route').click();
  await expect(routes).toHaveCount(2);
  await routes.nth(1).locator('.route-cc').fill('22');
  await routes.nth(1).locator('.route-channel').fill('2');
  await routes.nth(1).locator('.route-enabled').uncheck();
  const enabledMappings = await routes.locator('.route-enabled').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).checked));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-workspace').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const fs = await import('node:fs/promises');
  const saved = JSON.parse(await fs.readFile(path!, 'utf8'));
  expect(saved).toMatchObject({ format: 'patchcraft-visual-workspace', workspaceVersion: 1, name: 'Untitled workspace' });
  expect(saved.recipe.midiRoutes).toHaveLength(2);
  expect(saved.recipe.midiRoutes[0]).toMatchObject({ signalId: 'scene-energy', cc: 21, channel: 1, min: 0, max: 127 });
  expect(saved.recipe.midiRoutes[1]).toMatchObject({ signalId: 'scene-energy', cc: 22, channel: 2, min: 0, max: 127 });
  expect(saved.recipe.midiRoutes.map((route: { enabled: boolean }) => route.enabled)).toEqual(enabledMappings);
  await page.locator('#workspace-file').setInputFiles({ name: 'multi-route.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.locator('.cc-route')).toHaveCount(2);
  await expect(routes.nth(1).locator('.route-cc')).toHaveValue('22');
  await expect(routes.nth(1).locator('.route-channel')).toHaveValue('2');
  await expect(routes.nth(1).locator('.route-enabled')).not.toBeChecked();
  await expect(routes.nth(0).locator('.route-enabled')).not.toBeChecked();
  await expect(page.locator('#midi-state')).toHaveText('MIDI off');
});

test('named signal tabs keep independent measured inputs and project mappings link each signal to its own CC', async ({ page }) => {
  await page.goto('/visual-lab.html');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(1);
  await page.locator('#add-control-signal').click();
  await expect(tabs).toHaveCount(2);
  const addedTab = tabs.nth(1);
  await addedTab.click();
  await addedTab.locator('.rename-signal').click();
  await page.locator('.signal-tab-editor').fill('Motion macro');
  await page.locator('.signal-tab-editor').press('Enter');
  await page.locator('#add-signal-input').click();
  const sourceOptions = await page.locator('#brightness-source option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
  expect(sourceOptions.length).toBeGreaterThan(0);
  await page.locator('#brightness-source').selectOption(sourceOptions[0]);
  await page.locator('#brightness-weight').fill('0.7');
  await expect(page.locator('#brightness-source')).toHaveValue(sourceOptions[0]);

  await tabs.first().click();
  await expect(page.locator('#active-signal-name')).toHaveValue('Color Focus');
  await expect(page.locator('#brightness-source')).not.toHaveValue(sourceOptions[0]);
  await tabs.nth(1).click();
  await expect(page.locator('#active-signal-name')).toHaveValue('Motion macro');
  await expect(page.locator('#brightness-source')).toHaveValue(sourceOptions[0]);

  await page.locator('#add-cc-route').click();
  const mappings = page.locator('.cc-route');
  await mappings.nth(1).locator('.route-signal').selectOption({ label: 'Motion macro' });
  await mappings.nth(1).locator('.route-cc').fill('23');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-workspace').click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  const fs = await import('node:fs/promises');
  const saved = JSON.parse(await fs.readFile(savedPath!, 'utf8'));
  expect(saved.recipe.controlSignals).toHaveLength(2);
  expect(saved.recipe.controlSignals[0].name).toBe('Color Focus');
  expect(saved.recipe.controlSignals[1]).toMatchObject({ name: 'Motion macro', inputs: expect.arrayContaining([expect.objectContaining({ source: sourceOptions[0], weight: 0.7 })]) });
  expect(saved.recipe.midiRoutes[1]).toMatchObject({ signalId: saved.recipe.controlSignals[1].id, cc: 23 });
  await page.locator('#workspace-file').setInputFiles({ name: 'signal-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.cc-route')).toHaveCount(2);
  await expect(page.locator('.cc-route').nth(1).locator('.route-signal')).toHaveValue(saved.recipe.controlSignals[1].id);
  await expect(page.locator('#midi-state')).toHaveText('MIDI off');
});
