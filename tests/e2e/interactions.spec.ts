import { expect, test } from '@playwright/test';
import { closeActions, findPlayableMinion, handCountAfterMinion, handPoint, openActions, openGame, screenPoint, visibleHand, waitForPlayerOrResult } from './helpers';

test('canvas click, drag cancellation, successful drag, paused bot and restart', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page, 'goblin');

  // Canvas clicks select the same card as the accessible controls.
  let choice = await findPlayableMinion(page);
  await closeActions(page);
  let point = await handPoint(page, choice.index, choice.count);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.turn-ribbon')).toContainText('Выберите место');
  await page.keyboard.press('Escape');
  await expect(page.locator('.turn-ribbon')).toHaveText('Ваш ход');

  // Escape must cancel the pending pointer gesture as well as selection.
  const beforeMana = await page.locator('.mana-display strong').textContent();
  await page.mouse.move(10, 300);
  await page.waitForTimeout(350); // Let the hovered card return to its public hand position.
  point = await handPoint(page, choice.index, choice.count);
  const drop = await screenPoint(page, [0, .95, 1.0]);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 14 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(250);
  expect(await page.locator('.mana-display strong').textContent()).toBe(beforeMana);
  await openActions(page);
  expect((await visibleHand(page)).length).toBe(choice.count);

  // The same physical drag without cancellation must commit exactly one card.
  choice = await findPlayableMinion(page);
  await closeActions(page);
  await page.mouse.move(10, 300);
  await page.waitForTimeout(350);
  point = await handPoint(page, choice.index, choice.count);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 16 });
  await page.mouse.up();
  await expect(page.locator('.end-turn')).toBeDisabled();
  await waitForPlayerOrResult(page);
  await openActions(page);
  expect((await visibleHand(page)).length).toBe(handCountAfterMinion(choice.count, choice.definition));
  await expect(page.locator('.battle-log')).toContainText(`Вы: ${choice.definition.name}`);

  // Opening the menu cancels the bot's pending timer; resume preserves its turn.
  await closeActions(page);
  await page.locator('.end-turn').click();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  const turnAtPause = await page.locator('.end-turn span').textContent();
  const manaAtPause = await page.locator('.mana-display strong').textContent();
  const logAtPause = await page.locator('.battle-log ol').textContent();
  await page.waitForTimeout(2400);
  expect(await page.locator('.end-turn span').textContent()).toBe(turnAtPause);
  expect(await page.locator('.mana-display strong').textContent()).toBe(manaAtPause);
  expect(await page.locator('.battle-log ol').textContent()).toBe(logAtPause);
  await page.getByRole('button', { name: 'Вернуться в партию', exact: true }).click();
  await waitForPlayerOrResult(page);

  // Restart while a bot move is pending must not apply that move to the new deal.
  await page.locator('.end-turn').click();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: 'Начать заново', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Хорошее начало — полдела' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Оставить карты и начать', exact: true })).toBeEnabled();
  const openingCount = await page.locator('.mulligan-choice').count();
  expect([3, 4]).toContain(openingCount);
  await page.waitForTimeout(2400);
  await expect(page.locator('.end-turn span')).toHaveText('Ход 0');
  await expect(page.locator('.mulligan-choice')).toHaveCount(openingCount);
  await expect(page.locator('.battle-log ol')).toHaveText('Сейчас начнётся история.');
  await expect(page.locator('.opponent-heading .hero-health')).toHaveText('30♥');
  await expect(page.locator('.player-heading .hero-health')).toHaveText('30♥');
  expect(errors).toEqual([]);
});
