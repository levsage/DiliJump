import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const visible = (id) => `#${id}:not([hidden])`;

/** Fail the test on any console error, CSP violation or uncaught exception. */
function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openMenu(page) {
  await page.goto('./');
  await expect(page.locator(visible('screen-menu'))).toBeVisible();
}

test('menu loads cleanly with the release version and a CSP', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page);
  await expect(page).toHaveTitle(/DiliJump/);
  await expect(page.locator('[data-bind="version"]')).toHaveText(version);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /og-image\.jpg$/,
  );
  // all sprites decoded
  const broken = await page.evaluate(() =>
    [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
  );
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});

test('play → HUD + controls, pause and resume, back to menu', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page);
  await page.fill('#name-input', 'E2E Bot');
  await page.click(`${visible('screen-menu')} [data-action="play"]`);

  await expect(page.locator(visible('hud'))).toBeVisible();
  await expect(page.locator(visible('controls'))).toBeVisible();
  await expect(page.locator('[data-bind="player-name"]')).toHaveText('E2E Bot');

  // hold ◀ for a moment: the button reacts and the game keeps running
  const left = page.locator('.ctrl--move[data-dir="-1"]');
  const box = await left.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();

  await page.keyboard.press('KeyP');
  await expect(page.locator(visible('screen-pause'))).toBeVisible();
  await page.click(`${visible('screen-pause')} [data-action="resume"]`);
  await expect(page.locator(visible('screen-pause'))).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.click(`${visible('screen-pause')} [data-action="menu"]`);
  await expect(page.locator(visible('screen-menu'))).toBeVisible();
  expect(errors).toEqual([]);
});

test('player level: XP bar on the menu, level badge in the HUD and leaderboard', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // a player from before v2.2 (no lifetime XP yet) + a board entry with a level
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'dilijump:v1:profile',
      JSON.stringify({ name: 'Leveler', bestScore: 2600, gamesPlayed: 3 }),
    );
    localStorage.setItem(
      'dilijump:v1:leaderboard',
      JSON.stringify([
        { id: 'x', name: 'Rahim', score: 5000, coins: 1, height: 1, date: 1, total: 27000 },
      ]),
    );
  });
  await openMenu(page);
  // the best score counts as XP: 2 600 → level 3, 100 / 2 000 into it
  await expect(page.locator('[data-bind="menu-xp-level"]')).toHaveText('3');
  await expect(page.locator('[data-bind="menu-xp-text"]')).toHaveText('100 / 2,000 XP');

  await page.click('#screen-menu [data-action="play"]');
  await expect(page.locator('[data-bind="player-level"]')).toHaveText('Lv 3');
  await page.keyboard.press('p');
  await page.click('#screen-pause [data-action="menu"]');

  await page.click('#screen-menu [data-action="leaderboard"]');
  const row = page.locator('#screen-leaderboard .lb-row').first();
  await expect(row.locator('.lvl-pill')).toHaveText('Lv 10');
  await expect(row).toContainText('Rahim');
  expect(errors).toEqual([]);
});

test('leaderboard opens and closes', async ({ page }) => {
  const errors = watchErrors(page);
  await openMenu(page);
  await page.click(`${visible('screen-menu')} [data-action="leaderboard"]`);
  await expect(page.locator(visible('screen-leaderboard'))).toBeVisible();
  await page.click(`${visible('screen-leaderboard')} [data-action="close-leaderboard"]`);
  await expect(page.locator(visible('screen-menu'))).toBeVisible();
  expect(errors).toEqual([]);
});

test('installs a service worker and works offline', async ({ page, context }) => {
  await openMenu(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // reload once so the page is controlled, then cut the network
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(visible('screen-menu'))).toBeVisible();
  await page.fill('#name-input', 'Offline Bot');
  await page.click(`${visible('screen-menu')} [data-action="play"]`);
  await expect(page.locator(visible('hud'))).toBeVisible();
  await context.setOffline(false);
});

test('unknown pages get the branded 404', async ({ request }) => {
  const res = await request.get('404.html');
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain('Back to DiliJump');
});
