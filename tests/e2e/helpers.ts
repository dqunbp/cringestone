import { expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';
import { CARDS, HEROES } from '../../src/core/catalog';
import type { HeroId } from '../../src/core/types';

export async function openGame(page: Page, hero: HeroId) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(HEROES[hero].name) }).click();
  await page.getByRole('button', { name: 'Занять место за столом' }).click();
  const keep = page.getByRole('button', { name: 'Оставить карты и начать', exact: true });
  await expect(keep).toBeEnabled({ timeout: 60_000 });
  // A real redraw both tests mulligan and finds a useful opening without seeding the app.
  const choices = page.locator('.mulligan-choice');
  const labels = await choices.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') || ''));
  for (let index = 0; index < labels.length; index += 1) {
    const definition = Object.values(CARDS).find((card) => labels[index].startsWith(`${card.name}:`));
    if (definition && (definition.cost > 3 || definition.type === 'spell' && definition.id !== 'spark')) await choices.nth(index).click();
  }
  await page.getByRole('button', { name: /^(Оставить карты и начать|Заменить \d+ и начать)$/ }).click();
  await waitForPlayerOrResult(page);
  await expect(page.locator('.game-canvas canvas')).toBeVisible();
}

export async function waitForPlayerOrResult(page: Page) {
  await page.waitForFunction(() => {
    if (document.querySelector('.result-overlay')) return true;
    const button = document.querySelector<HTMLButtonElement>('.end-turn');
    return !!button && !button.disabled;
  }, undefined, { timeout: 90_000 });
}

export async function openActions(page: Page) {
  const panel = page.locator('.accessible-actions');
  if (!(await panel.getAttribute('open')) && !(await panel.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await panel.locator('summary').click();
  }
}

export async function closeActions(page: Page) {
  const panel = page.locator('.accessible-actions');
  if (await panel.evaluate((node) => (node as HTMLDetailsElement).open)) await panel.locator('summary').click();
}

function cardFromButton(text: string) {
  return Object.values(CARDS).find((card) => text.endsWith(card.name));
}

export async function finishSelection(page: Page, enemyHeroName: string) {
  const place = page.getByRole('button', { name: 'Поставить на стол', exact: true });
  if (await place.isVisible()) {
    await place.click();
    return;
  }
  const targets = page.locator('.target-buttons button:enabled');
  if (await targets.count()) {
    const hero = targets.filter({ hasText: enemyHeroName });
    if (await hero.count()) await hero.first().click();
    else await targets.first().click();
  }
}

/** All decisions use visible controls; no engine state, globals, or hidden test API. */
export async function completeMatch(page: Page, hero: HeroId, captureProof = false) {
  const enemy = HEROES[hero === 'goblin' ? 'mage' : 'goblin'].name;
  let commands = 0;
  let captured = false;
  for (; commands < 350; commands += 1) {
    await waitForPlayerOrResult(page);
    if (await page.locator('.result-overlay').isVisible()) break;
    await openActions(page);

    if (captureProof && !captured && (commands >= 25 || await page.locator('.target-buttons button').count() >= 3)) {
      await closeActions(page);
      await page.mouse.move(10, 300);
      await page.waitForTimeout(350);
      await mkdir('artifacts/qa', { recursive: true });
      await page.screenshot({ path: `artifacts/qa/battle-${hero}.png`, fullPage: true });
      await openActions(page);
      captured = true;
    }

    const attackers = page.locator('.target-buttons button:enabled');
    if (await attackers.count()) {
      await attackers.first().click();
      await expect(page.locator('.turn-ribbon')).toContainText('Выберите подсвеченную цель');
      await finishSelection(page, enemy);
      continue;
    }

    const hand = page.locator('.hand-buttons button:enabled');
    const choices = await hand.allTextContents();
    if (choices.length) {
      // Spend on the largest available card; draw/coin follow when no larger play fits.
      const best = choices.map((text, index) => ({ index, card: cardFromButton(text) }))
        .sort((a, b) => (b.card?.cost ?? 0) - (a.card?.cost ?? 0))[0];
      await hand.nth(best.index).click();
      if (best.card?.type === 'minion' || best.card?.effect?.type === 'damage' || best.card?.effect?.type === 'buff') {
        await expect(page.locator('.turn-ribbon')).toContainText('Выберите');
        await finishSelection(page, enemy);
      }
      continue;
    }

    const power = page.locator('.power-button');
    if (await power.isEnabled()) {
      await power.click();
      if (hero === 'mage') {
        await expect(page.locator('.turn-ribbon')).toContainText('Выберите подсвеченную цель');
        await finishSelection(page, enemy);
      }
      continue;
    }
    await page.locator('.end-turn').click();
  }
  await expect(page.getByRole('dialog', { name: 'Результат партии' })).toBeVisible();
  expect(commands, 'The game should terminate through normal play').toBeLessThan(350);
  return commands;
}

/** Project known public scene geometry to screen, equivalent to aiming by sight. */
export async function screenPoint(page: Page, point: [number, number, number]) {
  const box = await page.locator('.game-canvas canvas').boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  const aspect = box.width / box.height;
  const narrow = Math.max(1, 1.58 / aspect);
  const camera = new PerspectiveCamera(43, aspect, 0.1, 60);
  camera.position.set(0, 11.3 * narrow, 10.1 * narrow);
  camera.lookAt(0, .2, .45);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const projected = new Vector3(...point).project(camera);
  return { x: box.x + (projected.x + 1) * box.width / 2, y: box.y + (1 - projected.y) * box.height / 2 };
}

export async function handPoint(page: Page, index: number, count: number) {
  const center = index - (count - 1) / 2;
  const spread = Math.min(1.5, 7.4 / Math.max(count - 1, 1));
  return screenPoint(page, [center * spread, .8 + index * .013, 4.5 + Math.abs(center) ** 2 * .025]);
}

export async function visibleHand(page: Page) {
  return page.locator('.hand-buttons button').evaluateAll((buttons) => buttons.map((button, index) => ({
    index, text: button.textContent || '', enabled: !(button as HTMLButtonElement).disabled,
  })));
}

export async function findPlayableMinion(page: Page) {
  for (let turn = 0; turn < 10; turn += 1) {
    await waitForPlayerOrResult(page);
    await openActions(page);
    const hand = await visibleHand(page);
    const choice = hand.find((item) => item.enabled && cardFromButton(item.text)?.type === 'minion');
    if (choice) return { ...choice, count: hand.length, definition: cardFromButton(choice.text)! };
    await page.locator('.end-turn').click();
  }
  throw new Error('No playable minion appeared in ten player turns');
}

export function handCountAfterMinion(before: number, definition: typeof CARDS[string]) {
  const draws = definition.effect?.type === 'draw' ? definition.effect.amount : 0;
  return Math.min(10, before - 1 + draws);
}

/** Recheck final canvas geometry before continuing the same match through DOM controls. */
export async function playOpeningMinionByDrag(page: Page) {
  const choice = await findPlayableMinion(page);
  const beforeMana = await page.locator('.mana-display strong').textContent();
  const drop = await screenPoint(page, [0, .95, 1.0]);
  const drag = async (cancel: boolean) => {
    await closeActions(page);
    await page.mouse.move(10, 300);
    await page.waitForTimeout(350);
    const point = await handPoint(page, choice.index, choice.count);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 12 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  };
  await drag(true);
  await openActions(page);
  expect((await visibleHand(page)).length).toBe(choice.count);
  expect(await page.locator('.mana-display strong').textContent()).toBe(beforeMana);
  await drag(false);
  await expect(page.locator('.end-turn')).toBeDisabled();
  await waitForPlayerOrResult(page);
  await openActions(page);
  expect((await visibleHand(page)).length).toBe(handCountAfterMinion(choice.count, choice.definition));
  await expect(page.locator('.battle-log')).toContainText(`Вы: ${choice.definition.name}`);
}
