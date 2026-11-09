import { test, expect } from '@playwright/test';

for (const locale of ['', 'en/']) {
  test((locale ? 'English' : 'Chinese') + ' illustrated guides stay readable and original images open with the keyboard', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(response.status() + ' ' + response.url()); });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      for (const route of ['first-use', 'launcher', 'settings', 'extensions', 'command-ui-views', 'developer/skill']) {
        await page.goto('./' + locale + 'docs/' + route + '/');
        const shot = page.locator('figure').filter({ has: page.locator('img[src*="/images/docs/"]') });
        const image = shot.getByRole('img');
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
        expect((await image.getAttribute('alt'))!.length).toBeGreaterThan(15);
        expect(await image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 400)).toBeTruthy();
        await expect(shot.locator('figcaption')).toHaveCount(0);
        const centered = await image.evaluate(image => {
          const bounds = image.getBoundingClientRect();
          const figure = image.closest('figure')!.getBoundingClientRect();
          return Math.abs((bounds.left + bounds.right - figure.left - figure.right) / 2) < 1;
        });
        expect(centered, route + ' image should be centered in the article').toBeTruthy();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        const link = shot.getByRole('link');
        await expect(link).toHaveAttribute('href', (await image.getAttribute('src'))!);
        if (width === 320) {
          await link.focus();
          await page.keyboard.press('Enter');
          await expect(page).toHaveURL(new RegExp('images/docs/.+[.]webp$'));
          const original = page.locator('body > img');
          await expect(original).toBeVisible();
          expect(await original.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(400);
        }
        if (width === 1440 && route === 'settings') {
          await page.screenshot({ path: testInfo.outputPath('settings-desktop.png'), fullPage: true });
        }
      }
    }
    expect(failures).toEqual([]);
  });
}
