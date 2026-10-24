import { expect, test } from '@playwright/test';
import { CARDS } from '../../src/core/catalog';

test('all art and fonts are ready before the menu can reveal unseen cards', async ({ page, context }) => {
  test.setTimeout(120_000);
  const lateResources: string[] = [];
  const errors: string[] = [];
  let menuReady = false;
  page.on('pageerror', error => errors.push(error.message));
  // A second loader must be observable even if the browser normally returns a cached image quickly.
  await context.route(/\/assets\/.*\.(png|ttf)$/, async route => {
    if (menuReady) {
      lateResources.push(new URL(route.request().url()).pathname);
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  await page.goto('/tests/scene-loading/');
  await expect(page.getByTestId('loading-status')).toHaveText('ready', { timeout: 60_000 });
  menuReady = true;
  const initialLogLength = await page.evaluate(() => window.readSceneLoadingDiagnostics().entries.length);
  for (let sequence = 1; sequence <= Object.keys(CARDS).length; sequence += 1) {
    await page.getByRole('button', { name: 'Next unseen card' }).click();
    await expect(page.getByTestId('settled')).toHaveText(String(sequence));
    expect(lateResources, `new resources after scene.ready, sequence ${sequence}`).toEqual([]);
  }
  const log = await page.evaluate(start => window.readSceneLoadingDiagnostics().entries.slice(start), initialLogLength);
  expect(log.filter(event => event.type === 'scene.suspense.enter' || event.type === 'webgl.context.lost')).toEqual([]);
  expect(errors).toEqual([]);
});
