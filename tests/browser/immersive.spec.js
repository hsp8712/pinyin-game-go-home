import { test, expect } from '@playwright/test';
const action = (page, name) => page.locator(`[data-action="${name}"]`);
async function seed(page, { count = 4, scene = 'home', positions, challenge = false, reducedMotion = false, legacy = false } = {}) {
  await page.goto('/');
  await page.evaluate(async options => {
    const { createGame, emptyStore } = await import('/src/engine.js');
    const { ENTRIES } = await import('/src/data.js');
    const selected = ENTRIES.slice(0, options.count).map(e => e.id);
    const game = createGame({ mode: 'initial', selected, distance: 5, scene: options.scene, character: 'rabbit', order: 'balanced', challenge: options.challenge });
    if (options.positions) game.positions = Object.fromEntries(selected.map((id, i) => [id, options.positions[i] ?? 0]));
    if (options.legacy) { game.config.order = 'random'; delete game.catchUpLast; }
    sessionStorage.setItem('immersive-seed', JSON.stringify({ ...emptyStore(), reducedMotion: options.reducedMotion, currentId: game.id, games: [game] }));
  }, { count, scene, positions, challenge, reducedMotion, legacy });
  await page.addInitScript(() => {
    const seed = sessionStorage.getItem('immersive-seed');
    if (seed) { localStorage.setItem('pinyin-adventure-v1', seed); sessionStorage.removeItem('immersive-seed'); }
  });
  await page.reload(); await action(page, 'resume').click();
}
async function savedGame(page) {
  return page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pinyin-adventure-v1')); return s.games.find(g => g.id === s.currentId); });
}
async function expectControlsOnLandscape(page) {
  const layout = await page.evaluate(() => {
    const scene = document.querySelector('.map-scene');
    const canvas = scene.querySelector('.landscape').getBoundingClientRect();
    const controls = scene.querySelector('.map-controls').getBoundingClientRect();
    const route = scene.querySelector('.route-path').getBoundingClientRect();
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const buttons = [...scene.querySelectorAll('.map-controls button')];
    return {
      inside: buttons.every(button => { const box = button.getBoundingClientRect(); return box.left >= canvas.left && box.right <= canvas.right && box.top >= canvas.top && box.bottom <= canvas.bottom; }),
      onTop: buttons.every(button => { const box = button.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return button.contains(hit); }),
      routeClear: !overlaps(route, controls),
      tokensClear: [...scene.querySelectorAll('[data-token]')].every(token => !overlaps(token.getBoundingClientRect(), controls)),
    };
  });
  expect(layout).toEqual({ inside: true, onTop: true, routeClear: true, tokensClear: true });
}
for (const scene of ['home', 'river', 'mountain']) {
  test(`map shows twenty friends and expands a crowded space in ${scene}`, async ({ page }, info) => {
    await seed(page, { count: 20, scene });
    await expect(page.locator('[data-token]')).toHaveCount(20);
    const stage = await page.locator('#adventure-root').boundingBox();
    expect(stage.width).toBeGreaterThan(info.project.use.viewport.width - 60);
    const token = page.locator('[data-token]').last();
    if (info.project.name === 'desktop') await token.hover(); else await token.click();
    await expect(page.locator('#map-popover')).toBeVisible();
    await expect(page.locator('#map-popover .position-item')).toHaveCount(20);
    const popup = await page.locator('#map-popover').boundingBox();
    expect(popup.x).toBeGreaterThanOrEqual(stage.x); expect(popup.x + popup.width).toBeLessThanOrEqual(stage.x + stage.width);
    await action(page, 'close-position').click();
    await expect(page.locator('#map-popover')).toBeHidden();
    await expectControlsOnLandscape(page);
    await action(page, 'draw').click();
    await expectControlsOnLandscape(page);
    await expect(page.locator('#adventure-root .pinyin-card')).toBeVisible();
    await expect(page.locator('.active-token')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/immersive-${scene}-${info.project.name}.png`, fullPage: true });
  });
}
test('fullscreen target and individual token survive drawing, grading and dialogs', async ({ page }) => {
  await seed(page, { count: 1 });
  await page.evaluate(() => { window.stageBefore = document.querySelector('#adventure-root'); window.tokenBefore = document.querySelector('[data-token]'); });
  await action(page, 'fullscreen').click();
  await expect(action(page, 'fullscreen')).toHaveAttribute('aria-pressed', 'true');
  await action(page, 'draw').click();
  await action(page, 'help').click(); await expect(page.locator('#adventure-root .toast')).toBeVisible();
  await page.getByRole('button', { name: '查看玩法', exact: true }).click(); await expect(page.locator('#adventure-root [role="dialog"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-rating="independent"]').click();
  await expect(action(page, 'draw')).toBeEnabled();
  expect(await page.evaluate(() => window.stageBefore === document.querySelector('#adventure-root') && window.tokenBefore === document.querySelector('[data-token]'))).toBe(true);
  await expect(action(page, 'fullscreen')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  // Headless Chromium may not dispatch the native fullscreen Escape shortcut.
  if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen());
  await expect(action(page, 'fullscreen')).toHaveAttribute('aria-pressed', 'false');
});
test('fullscreen rejection falls back, Escape exits and pause clears the overlay', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => { document.querySelector('#adventure-root').requestFullscreen = () => Promise.reject(new Error('Denied')); });
  await action(page, 'fullscreen').click();
  await expect(page.locator('#adventure-root')).toHaveClass(/fallback-fullscreen/);
  await action(page, 'draw').click();
  await expect(page.locator('#adventure-root')).toHaveClass(/fallback-fullscreen/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#adventure-root')).not.toHaveClass(/fallback-fullscreen/);
  await action(page, 'fullscreen').click(); await action(page, 'pause').click();
  await expect(page.locator('html')).not.toHaveClass(/map-expanded/);
  await expect(page.getByRole('heading', { name: '在这里扎营，休息一下' })).toBeVisible();
});
test('movement passes intermediate nodes, locks duplicate scoring, and saves before completion', async ({ page }) => {
  await seed(page, { count: 1 }); await action(page, 'draw').click();
  await page.evaluate(() => { window.movingToken = document.querySelector('[data-token]'); });
  await page.locator('[data-rating="independent"]').click();
  await expect(page.locator('.map-scene')).toHaveAttribute('data-phase', 'moving'); await expect(action(page, 'draw')).toHaveCount(0); await expect(action(page, 'undo')).toBeDisabled();
  const frames = await page.evaluate(() => document.querySelector('[data-token]').getAnimations()[0].effect.getKeyframes());
  expect(frames).toHaveLength(3);
  expect(frames[1].transform).not.toEqual(frames[0].transform);
  expect(frames[1].transform).not.toEqual(frames[2].transform);
  const game = await savedGame(page); expect(Object.values(game.positions)).toEqual([2]); expect(game.events).toHaveLength(1);
  await expect(action(page, 'draw')).toBeEnabled();
  expect(await page.evaluate(() => window.movingToken === document.querySelector('[data-token]'))).toBe(true);
  await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '2');
});
test('refresh and pause during movement retain the saved destination without replay', async ({ page }) => {
  await seed(page, { count: 1 }); await action(page, 'draw').click();
  await page.locator('[data-rating="independent"]').click(); await page.reload();
  await action(page, 'resume').click();
  await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '2'); await expect(action(page, 'draw')).toBeEnabled();
  await action(page, 'draw').click(); await page.locator('[data-rating="independent"]').click();
  await action(page, 'pause').click(); await action(page, 'resume').click();
  await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '4');
  expect((await savedGame(page)).events).toHaveLength(2);
});
test('retreat, rest, reduced motion, final arrival and undo preserve the gameplay loop', async ({ page }) => {
  await seed(page, { count: 1, challenge: true, positions: [2] });
  await action(page, 'draw').click(); await page.locator('[data-rating="pending"]').click();
  await expect(action(page, 'draw')).toBeEnabled(); await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '1');
  await action(page, 'disable-challenge').click(); await action(page, 'draw').click(); await page.locator('[data-rating="pending"]').click();
  await expect(action(page, 'draw')).toBeEnabled(); await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '1');
  await seed(page, { count: 1, positions: [4], reducedMotion: true, legacy: true });
  await action(page, 'draw').click(); await page.locator('[data-rating="independent"]').click();
  await expect(page.getByRole('heading', { name: '小屋的灯亮啦！' })).toBeVisible();
  const game = await savedGame(page); expect(game.config.order).toBe('balanced'); expect(Object.values(game.positions)).toEqual([5]);
  await action(page, 'undo').click(); await expect(page.locator('.pinyin-card')).toBeVisible();
  await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '4');
});
test('keyboard focus exposes all friends and Enter moves focus into the popover', async ({ page }) => {
  await seed(page, { count: 20 });
  await page.locator('[data-token]').last().focus();
  await expect(page.locator('#map-popover')).toBeVisible();
  await page.keyboard.press('Enter'); await expect(action(page, 'close-position')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#map-popover')).toBeHidden();
});
test('final arrival finishes on the map before victory and fullscreen survives undo', async ({ page }) => {
  await seed(page, { count: 1, positions: [4] });
  await action(page, 'fullscreen').click(); await action(page, 'draw').click();
  await page.locator('[data-rating="independent"]').click();
  await expect(page.locator('.map-scene')).toHaveAttribute('data-phase', 'moving'); await expect(action(page, 'draw')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '小屋的灯亮啦！' })).toHaveCount(0);
  expect((await savedGame(page)).status).toBe('complete');
  await expect(page.getByRole('heading', { name: '小屋的灯亮啦！' })).toBeVisible();
  await expect(action(page, 'fullscreen')).toHaveAttribute('aria-pressed', 'true');
  await action(page, 'undo').click();
  await expect(action(page, 'retry')).toBeFocused();
  await expect(page.locator('[data-token]')).toHaveAttribute('data-position', '4');
  await expect(action(page, 'fullscreen')).toHaveAttribute('aria-pressed', 'true');
});
test('all friends can be inspected when scattered across start, route and destination', async ({ page }) => {
  const positions = Array.from({ length: 20 }, (_, i) => i % 6);
  await seed(page, { count: 20, positions });
  for (let position = 0; position <= 5; position++) {
    const group = page.locator(`[data-position="${position}"]`);
    await group.last().focus();
    await expect(page.locator('#map-popover .position-item')).toHaveCount(positions.filter(p => p === position).length);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await action(page, 'draw').click(); await page.locator('[data-rating="independent"]').click();
  await expect(action(page, 'draw')).toBeEnabled();
  expect(await page.locator('[data-token]').evaluateAll(nodes => nodes.every(node => !node.getAnimations().length))).toBe(true);
});

test('overlay layout also fits fullscreen, fallback and a short landscape viewport', async ({ page }, info) => {
  await seed(page, { count: 20, positions: Array.from({ length: 20 }, (_, i) => i % 6) });
  await action(page, 'fullscreen').click(); await expectControlsOnLandscape(page);
  await action(page, 'draw').click(); await expectControlsOnLandscape(page);
  await page.screenshot({ path: `test-results/overlay-fullscreen-${info.project.name}.png`, fullPage: true });
  await action(page, 'fullscreen').click();
  await page.evaluate(() => { document.querySelector('#adventure-root').requestFullscreen = () => Promise.reject(new Error('Denied')); });
  await action(page, 'fullscreen').click(); await expectControlsOnLandscape(page);
  await action(page, 'fullscreen').click();
  await page.setViewportSize({ width: 844, height: 390 });
  // Short screens can scroll, but the controls still belong to the scenery.
  await page.locator('.map-controls').scrollIntoViewIfNeeded();
  await expectControlsOnLandscape(page);
});
