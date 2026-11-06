import { test, expect } from '@playwright/test';
const action = (page, id) => page.locator(`[data-action="${id}"]`);
async function createSingle(page, mode = 'initial', scene = 'home', challenge = false) {
  await page.goto('/');
  await page.locator(`[data-action="mode"][data-mode="${mode}"]`).click();
  await action(page, 'select-clear').click();
  await page.locator('[data-action="select-item"]').first().click();
  await page.locator(`[data-action="setup-scene"][data-id="${scene}"]`).click();
  if (challenge) { await page.locator('#challenge').check(); await page.locator('#challenge-consent').check(); }
  await action(page, 'start').click();
  await expect(action(page, 'draw')).toBeVisible();
}
async function score(page, rating) {
  await page.waitForTimeout(470);
  await action(page, 'draw').click();
  await page.locator(`[data-rating="${rating}"]`).click();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('home, all scenes and all mode selectors render without overflow', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page).toHaveTitle(/拼音回家大冒险/);
  await expect(page.locator('.mode-card')).toHaveCount(6); await noOverflow(page);
  await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  for (const scene of ['river', 'mountain', 'home']) {
    await page.locator(`[data-action="home-scene"][data-id="${scene}"]`).click();
    await expect(page.locator('.landscape')).toBeVisible();
  }
  for (const mode of ['initial', 'final', 'whole', 'tone', 'syllable', 'custom']) {
    await page.locator(`[data-action="mode"][data-mode="${mode}"]`).click();
    await expect(page.locator('.item-choice.selected')).toHaveCount(4); await noOverflow(page);
    await action(page, 'home').first().click();
  }
  expect(errors).toEqual([]);
});
test('draw survives refresh, help does not score, pause resumes same item', async ({ page }, info) => {
  await createSingle(page); await action(page, 'draw').click();
  const item = await page.locator('.pinyin-card').innerText();
  await action(page, 'help').click(); await expect(page.locator('.toast')).toContainText('提示');
  await action(page, 'retry').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pinyin-adventure-v1')).games[0].events.length)).toBe(0);
  await page.reload(); await action(page, 'resume').click(); await expect(page.locator('.pinyin-card')).toHaveText(item);
  await page.screenshot({ path: `test-results/game-${info.project.name}.png`, fullPage: true });
  await noOverflow(page);
  await action(page, 'pause').click(); await expect(page.getByRole('heading', { name: '在这里扎营，休息一下' })).toBeVisible();
  await action(page, 'home').last().click(); await page.reload(); await action(page, 'resume').click();
  await expect(page.locator('.pinyin-card')).toHaveText(item);
});
test('scoring, victory, undo and parent records form a complete loop', async ({ page }) => {
  await createSingle(page, 'syllable', 'mountain');
  await score(page, 'corrected');
  await expect(page.locator('.feedback')).toContainText('改对');
  await score(page, 'assisted');
  await expect(page.getByRole('heading', { name: '山顶的小旗升起来啦！' })).toBeVisible();
  await action(page, 'undo').click(); await expect(page.locator('.pinyin-card')).toHaveText('ba');
  await page.locator('[data-rating="assisted"]').click();
  await action(page, 'session-records').click();
  const row = page.locator('tbody tr'); await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(2)).toHaveText('2');
  await action(page, 'select-session-help').click(); await action(page, 'practice-selected').click();
  await expect(page.locator('.item-choice.selected')).toHaveCount(1); await noOverflow(page);
});
test('challenge consent persists across scene choice, can close without undo reopening', async ({ page }) => {
  await page.goto('/'); await action(page, 'new').click();
  await page.locator('#challenge').check(); await action(page, 'start').click();
  await expect(page.locator('.toast')).toContainText('确认');
  await page.locator('#challenge-consent').check();
  await page.locator('[data-action="setup-scene"][data-id="river"]').click();
  await expect(page.locator('#challenge-consent')).toBeChecked();
  await action(page, 'start').click(); await score(page, 'pending');
  await action(page, 'disable-challenge').click(); await action(page, 'undo').click();
  await expect(page.locator('[data-rating="pending"]')).toContainText('原地休息');
});
test('new session replacement preserves records; statistics lead to new practice', async ({ page }) => {
  await createSingle(page); await score(page, 'pending'); await score(page, 'assisted'); await score(page, 'pending');
  await action(page, 'home').first().click(); await action(page, 'new').click(); await action(page, 'start').click();
  await expect(page.getByRole('dialog')).toContainText('替换');
  await action(page, 'close-modal').click();
  await action(page, 'start').click(); await action(page, 'confirm-start').click();
  await action(page, 'stats').click(); await page.locator('[data-action="stats-kind"][data-value="weak"]').click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('[data-stat-id]').check(); await action(page, 'practice-selected').click();
  await expect(page.locator('.item-choice.selected')).toHaveCount(1);
});
test('keyboard dialog focus is trapped and Escape returns to trigger', async ({ page }) => {
  await page.goto('/'); await action(page, 'settings').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab'); await expect(action(page, 'close-modal')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#reduced-motion')).toBeFocused();
  await page.locator('#reduced-motion').check(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(action(page, 'settings')).toBeFocused();
  await page.reload(); await expect(page.locator('html')).toHaveClass(/reduced-motion/);
});
test('storage write failure is visible without preventing play', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await createSingle(page); await expect(page.getByRole('alert')).toContainText('保存失败');
  await action(page, 'draw').click(); await expect(page.locator('.pinyin-card')).toHaveText('b');
});
