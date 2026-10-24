import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { completeMatch, openGame, playOpeningMinionByDrag } from './helpers';

for (const hero of ['goblin', 'mage'] as const) {
  test(`complete a real browser match as ${hero} and start a rematch`, async ({ page, browserName }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openGame(page, hero);
    await playOpeningMinionByDrag(page);
    const commands = await completeMatch(page, hero, browserName === 'chromium');
    test.info().annotations.push({ type: 'normal-player-actions', description: String(commands) });
    await expect(page.locator('.result-overlay h2')).toHaveText(/^(Славная победа!|Бывает и такое|Боевая ничья)$/);
    await expect(page.locator('.end-turn')).toBeDisabled();
    if (browserName === 'chromium') {
      await mkdir('artifacts/qa', { recursive: true });
      await page.screenshot({ path: `artifacts/qa/result-${hero}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Ещё партию', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Хорошее начало — полдела' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Оставить карты и начать', exact: true })).toBeEnabled();
    await expect(page.locator('.result-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
