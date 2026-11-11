import { expect, test } from '@playwright/test';

test('discovers audio devices and keeps demo audio running when its named signal stops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const OriginalAudioContext = window.AudioContext;
    // Keep the real rendering graph and use Chromium's silent output sink in CI.
    window.AudioContext = class extends OriginalAudioContext {
      constructor(options?: AudioContextOptions) {
        super({...options, sinkId: {type: 'none'}} as AudioContextOptions);
      }
    };
  });
  await page.context().grantPermissions(['microphone']);
  await page.goto('/visual-lab.html');
  const panel = page.getByRole('region', {name: 'Audio effects'});
  await panel.getByText('AUDIO EFFECTS', {exact: true}).click();
  await expect(panel.getByRole('checkbox', {name: /^Enable /})).toHaveCount(10);
  await panel.getByRole('button', {name: 'Find audio devices'}).click();
  await expect.poll(() => panel.getByLabel('Audio input').locator('option').count()).toBeGreaterThan(2);
  await panel.getByLabel('Audio input').selectOption('sample');
  const chorus = panel.getByRole('region', {name: 'Chorus', exact: true});
  const filter = panel.getByRole('region', {name: 'Filter', exact: true});
  await chorus.getByRole('checkbox', {name: 'Enable Chorus'}).check();
  await panel.getByRole('button', {name: 'Start audio'}).click();
  await expect(panel.getByText('Audio on', {exact: true})).toBeVisible();
  await expect.poll(() => panel.locator('meter').evaluate(meter => (meter as HTMLMeterElement).value)).toBeGreaterThan(0);
  await expect(panel.getByText(/Physical round-trip latency requires loopback/)).toBeVisible();
  await chorus.getByLabel('Control source').selectOption('scene-energy');
  await expect(chorus.getByText(/Manual fallback/)).toBeVisible();
  await expect(filter.getByLabel('Control source')).toHaveValue('');
  await page.locator('#add-control-signal').click();
  const second = await filter.getByLabel('Control source').locator('option').last().getAttribute('value');
  expect(second).toBeTruthy();
  await filter.getByLabel('Control source').selectOption(second!);
  await expect(chorus.getByLabel('Control source')).toHaveValue('scene-energy');
  await filter.getByLabel('Control source').selectOption('scene-energy');
  await page.getByRole('button', {name: 'Demo scene', exact: true}).click();
  await expect(chorus.getByText(/Named signal ·/)).toBeVisible();
  await expect(filter.getByText(/Named signal ·/)).toBeVisible();
  await chorus.getByRole('button', {name: 'Move Chorus down'}).click();
  await expect(panel.locator('.audio-effect-card').first()).toHaveAttribute('aria-label', 'Compressor');
  await expect(chorus.getByLabel('Control source')).toHaveValue('scene-energy');
  await expect(panel.getByText('Audio on', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Stop source'}).click();
  await expect(chorus.getByText(/Manual fallback/)).toBeVisible();
  await expect(filter.getByText(/Manual fallback/)).toBeVisible();
  await expect(panel.getByText('Audio on', {exact: true})).toBeVisible();
  await panel.getByLabel('Bypass').check();
  await expect(chorus.getByText('Bypassed', {exact: true})).toBeVisible();
  await expect(filter.getByText('Bypassed', {exact: true})).toBeVisible();
  await panel.getByRole('button', {name: 'Stop audio'}).click();
  await expect(panel.getByText('Audio off', {exact: true})).toBeVisible();
  expect(errors).toEqual([]);
});
