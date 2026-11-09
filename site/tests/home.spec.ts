import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

for (const locale of ['', 'en/']) {
  const en = Boolean(locale);
  test((en ? 'English' : 'Chinese') + ' home previews, prompt and localized navigation work with the keyboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./' + locale);
    const search = page.getByRole('button', { name: en ? 'Search' : '搜索', exact: true });
    await search.focus(); await page.keyboard.press('Enter');
    await expect(search).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#preview-search')).toBeVisible();
    await expect(page.locator('#preview-launcher')).toBeHidden();
    await page.getByRole('button', { name: 'Launcher', exact: true }).click();
    await expect(page.locator('#preview-launcher')).toBeVisible();
    await page.locator('summary').focus(); await page.keyboard.press('Enter');
    const prompt = page.locator('[data-copy-block]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button').click();
    await expect(prompt.getByRole('status')).toHaveText(en ? 'Copied' : '已复制');
    expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(await prompt.locator('textarea').inputValue());
    await page.locator('.ai-copy').getByRole('link', { name: 'Build with AI' }).click();
    await expect(page).toHaveURL(new RegExp('/Clackly/' + locale + 'docs/developer/$'));
    await page.goto('./' + locale);
    await page.locator('header').getByRole('link', { name: en ? '简体中文' : 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', en ? 'zh-CN' : 'en');
    const download = page.locator('.hero-copy').getByRole('link', { name: en ? '下载 Windows 版' : 'Download for Windows' });
    await download.click();
    await expect(page).toHaveURL('https://github.com/Wutpeach/Clackly/releases/tag/v0.1.6');
  });

  for (const width of [1440, 390, 320]) {
    test((en ? 'English' : 'Chinese') + ' home at ' + width + 'px has readable product captures and no overflow', async ({ page }, testInfo) => {
      const failures: string[] = [];
      page.on('pageerror', error => failures.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failures.push(response.status() + ' ' + response.url()); });
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      await page.goto('./' + locale);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.hero-copy .primary')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      // Product contents stay inside their stage at every shipped phone size.
      const contained = await page.locator('.product-capture').evaluate(el => {
        const image = el.getBoundingClientRect(), stage = el.closest('.product-stage')!.getBoundingClientRect();
        return image.left >= stage.left && image.right <= stage.right && image.top >= stage.top && image.bottom <= stage.bottom;
      });
      expect(contained).toBeTruthy();
      await page.locator('.closing').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.images].filter(i => !i.hidden).every(i => i.complete && i.naturalWidth > 0));
      await page.evaluate(() => scrollTo(0, 0));
      await mkdir('evidence/issue-14', { recursive: true });
      const name = (en ? 'en' : 'zh') + '-' + width;
      await page.screenshot({ path: 'evidence/issue-14/' + name + '.png', fullPage: true, animations: 'disabled' });
      if (width === 1440) await page.screenshot({ path: 'evidence/issue-14/' + name + '-hero.png', animations: 'disabled' });
      await page.getByRole('button', { name: en ? 'Search' : '搜索', exact: true }).click();
      await expect(page.locator('#preview-search')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(name + '-search.png'), animations: 'disabled' });
      expect(failures).toEqual([]);
    });
  }
}

test('reduced motion keeps the product visible and disables its entrance animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('#preview-launcher')).toBeVisible();
  expect(await page.locator('.product-stage').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('without JavaScript the home still shows the product, download and full prompt', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/Clackly/');
  await expect(page.locator('#preview-launcher')).toBeVisible();
  await expect(page.locator('[data-preview-switch]')).toBeHidden();
  await expect(page.locator('.hero-copy .primary')).toHaveAttribute('href', 'https://github.com/Wutpeach/Clackly/releases/tag/v0.1.6');
  await page.locator('summary').click();
  await expect(page.locator('textarea')).toBeVisible();
  await context.close();
});
