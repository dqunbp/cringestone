import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test('explains unavailable WebGL 2 and returns to hero selection', async ({ page }) => {
  // Simulate a browser capability failure, without changing any game state.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...options: unknown[]) {
      if (contextId === 'webgl2') return null;
      return Reflect.apply(original, this, [contextId, ...options]);
    } as typeof original;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Занять место за столом' }).click();
  const failure = page.getByRole('alert');
  await expect(failure).toContainText('Для игрового стола нужен браузер с WebGL 2');
  await expect(failure.getByRole('button', { name: 'Попробовать снова' })).toBeVisible();
  await failure.getByRole('button', { name: 'К выбору героя' }).click();
  await expect(page.getByRole('group', { name: 'Выберите героя' })).toBeVisible();
  await expect(page.locator('.game-shell')).toHaveCount(0);
});

test('reports a failed card texture and recovers after Retry', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/assets/cards/squire.png', (route) => route.abort('failed'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Занять место за столом' }).click();
  const failure = page.getByRole('alert');
  await expect(failure).toContainText('Не удалось загрузить игровой стол');
  await expect(page.locator('.end-turn')).toHaveCount(0);

  await page.unroute('**/assets/cards/squire.png');
  await failure.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(page.getByRole('group', { name: 'Выберите героя' })).toBeVisible();
  await openGame(page, 'mage');
  await expect(page.locator('.end-turn')).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
