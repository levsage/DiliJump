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

/**
 * Leave a run and return to the menu. Levels are random, so the mascot may
 * already have fallen: then use the game-over screen instead of pause.
 */
async function leaveRunToMenu(page) {
  if (!(await page.locator(visible('screen-gameover')).isVisible())) {
    await page.keyboard.press('Escape');
  }
  await page
    .locator(`${visible('screen-pause')}, ${visible('screen-gameover')}`)
    .locator('[data-action="menu"]')
    .first()
    .click();
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
  // all sprites decoded (images filled in later, e.g. the Dressing Room preview, have no src yet)
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((i) => i.getAttribute('src') && i.complete && i.naturalWidth === 0)
      .map((i) => i.src),
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

  // pause + resume first: without input the mascot bounces in place, so it's alive
  await page.keyboard.press('KeyP');
  await expect(page.locator(visible('screen-pause'))).toBeVisible();
  await page.click(`${visible('screen-pause')} [data-action="resume"]`);
  await expect(page.locator(visible('screen-pause'))).toHaveCount(0);

  // hold ◀: the button lights up while pressed (moving may make the mascot fall)
  const left = page.locator('.ctrl--move[data-dir="-1"]');
  const box = await left.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(left).toHaveClass(/is-pressed/);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(left).not.toHaveClass(/is-pressed/);

  await leaveRunToMenu(page);
  expect(errors).toEqual([]);
});

test('player level: XP bar on the menu, level badge in the HUD and leaderboard', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // a player from before v3.0 (no lifetime XP yet) + a board entry with a level
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
  await leaveRunToMenu(page);

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

test('dressing room: buy a skin with DLI, wear it, and it stays after a reload', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    // 150 DLI on this device (only on the first visit, so the purchase survives reload)
    const key = 'dilijump:v1:wallet';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ balance: 150, lifetime: 150 }));
    }
  });
  await openMenu(page);
  await page.fill('#name-input', 'Skin Tester');
  await page.locator(visible('screen-menu')).locator('[data-action="wardrobe"]').click();
  const room = page.locator(visible('screen-wardrobe'));
  await expect(room).toBeVisible();
  await expect(room.locator('[data-bind="wardrobe-wallet"]')).toHaveText('150');

  const card = (id) => room.locator(`.skin-card[data-skin="${id}"] .skin-card__btn`);
  await expect(card('classic')).toContainText('Wearing');
  await expect(card('golden')).toContainText('Need 50 more');
  await expect(card('golden')).toBeDisabled();

  // two taps: price → confirm
  await card('wings').click();
  await expect(card('wings')).toContainText('Confirm');
  await expect(room.locator('[data-bind="wardrobe-wallet"]')).toHaveText('150');
  await card('wings').click();
  await expect(card('wings')).toContainText('Wearing');
  await expect(room.locator('[data-bind="wardrobe-wallet"]')).toHaveText('50');
  await expect(room.locator('[data-bind="wardrobe-preview"]')).toHaveAttribute(
    'src',
    /skins\/wings\/idle\./,
  );
  await room.locator('[data-action="close-wardrobe"]').click();
  await expect(page.locator('[data-bind="wallet"]')).toHaveText('50');

  // a reload keeps the skin and the balance; the HUD avatar shows it
  await page.reload();
  await expect(page.locator(visible('screen-menu'))).toBeVisible();
  await expect(page.locator('[data-bind="wallet"]')).toHaveText('50');
  await page.locator(visible('screen-menu')).locator('[data-action="play"]').click();
  await expect(page.locator('.namebar__avatar')).toHaveAttribute('src', /skins\/wings\/avatar\./);
  await leaveRunToMenu(page);
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
