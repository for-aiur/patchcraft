import { test, expect } from '@playwright/test';

test('local visual lab previews image stages, offers a blank recipe canvas and JSON round trips', async ({ page }) => {
  await page.goto('/visual-lab.html');
  await expect(page.locator('.brand')).toBeVisible();
  await page.getByText('Recipe guide', { exact: true }).click();
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
  await expect(page.locator('#recipe-title')).toHaveText('Untitled recipe');
  await expect(page.locator('#pipeline-stages .stage-card')).toHaveCount(0);
  await expect(page.getByText('Start with a clean image.')).toBeVisible();
  await page.getByLabel('Recipe name').fill('Red motion test');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('red-motion-test.json');
  const imported = { schemaVersion: 1, id: 'imported-demo', name: 'Imported Demo', tagline: 'Loaded locally.', description: 'A test recipe.', image: { stages: [] }, weights: { brightness: 0.4, red: 0.4, motion: 0.2 }, midi: { cc: 74, channel: 1 }, target: 'Filter', steps: [] };
  await page.locator('#recipe-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(page.locator('#recipe-status')).toContainText('Unsupported recipe schema version');
  await expect(page.locator('#recipe-title')).toHaveText('Red motion test');
  await page.locator('#recipe-file').setInputFiles({ name: 'imported-demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.locator('#recipe-name')).toHaveValue('Imported Demo');
  await expect(page.locator('#recipe-status')).toContainText('MIDI is stopped');
  await expect(page.getByText(/Videos are processed in your browser/)).toBeVisible();
});

test('each image stage updates its own live preview from the same source frame', async ({ page }) => {
  await page.goto('/visual-lab.html');
  await page.getByRole('button', { name: 'Play demo scene' }).click();
  await expect(page.locator('#pipeline-state')).toContainText('Analyzing', { timeout: 10_000 });
  await expect(page.locator('#pipeline-stages .stage-preview.has-frame')).toHaveCount(4);
  await expect(page.locator('#processed-preview')).toBeVisible();
});

test('every recipe processes live frames and produces finite raw and calibrated readings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/visual-lab.html');
  const ids = await page.locator('#recipe-select option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(id => id !== '__blank'));
  for (const id of ids) {
    await page.locator('#recipe-select').selectOption(id);
    await page.getByRole('button', { name: 'Play demo scene', exact: true }).click();
    const count = await page.locator('.stage-card').count();
    await expect(page.locator('.stage-preview.has-frame')).toHaveCount(count, { timeout: 15_000 });
    await expect(page.locator('#pipeline-state')).toContainText('Analyzing');
    await expect(page.locator('#signal-state')).toContainText('Signal connected');
    await expect(page.locator('[data-measurement-value]').first()).not.toHaveText('—');
    const value = Number(await page.locator('#control-knob').getAttribute('aria-valuenow'));
    expect(Number.isFinite(value), id).toBeTruthy();
    expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(127);
  }
  expect(errors).toEqual([]);
});
