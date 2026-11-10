import { test, expect } from '@playwright/test';

test('Patchcraft sends a selected CC while parameter assignment stays in the receiving app', async ({ page }) => {
  await page.goto('/vision');
  await expect(page.getByText('Assign in your DAW or plugin')).toBeVisible();
  await expect(page.getByText(/Open the parameter's MIDI assignment mode/)).toBeVisible();
  await expect(page.getByText(/learn/i)).toHaveCount(0);
  await expect(page.getByLabel('MIDI output')).toBeVisible();
  await expect(page.getByLabel('CC number')).toBeVisible();
  await expect(page.getByText(/You can use one CC for multiple parameters/)).toBeVisible();
  await expect(page.getByText('Target parameter', { exact: true })).toHaveCount(0);
});
