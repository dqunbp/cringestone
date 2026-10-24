import { expect, test } from '@playwright/test';
import { openGame, waitForPlayerOrResult } from './helpers';

test('narrow viewport blocks entry and pauses a live bot turn until widened', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const hint = page.getByRole('dialog', { name: 'Столу нужно больше места', exact: true });

  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Расширьте окно браузера хотя бы до 1024 px.');
  await page.keyboard.press('Escape');
  await expect(hint).toBeVisible();
  await expect(page.locator('.game-shell')).toHaveCount(0);

  // The threshold itself is usable; the notice is not dismissed by Escape.
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(hint).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Занять место за столом' })).toBeEnabled();

  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page, 'mage');
  await page.locator('.end-turn').click();
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(hint).toBeVisible();
  const turnAtPause = await page.locator('.end-turn span').textContent();
  const logAtPause = await page.locator('.battle-log ol').textContent();
  const manaAtPause = await page.locator('.mana-display strong').textContent();

  await page.keyboard.press('Escape');
  await expect(hint).toBeVisible();
  // Exceeds both the bot think delay and the normal end-turn presentation.
  await page.waitForTimeout(2400);
  expect(await page.locator('.end-turn span').textContent()).toBe(turnAtPause);
  expect(await page.locator('.battle-log ol').textContent()).toBe(logAtPause);
  expect(await page.locator('.mana-display strong').textContent()).toBe(manaAtPause);
  await expect(page.locator('.game-canvas canvas')).toHaveCount(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(hint).toHaveCount(0);
  await waitForPlayerOrResult(page);
  await expect(page.locator('.end-turn')).toBeEnabled();
  expect(await page.locator('.end-turn span').textContent()).not.toBe(turnAtPause);
  expect(await page.locator('.battle-log ol').textContent()).not.toBe(logAtPause);
  await expect(page.getByRole('heading', { name: 'Хорошее начало — полдела' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
