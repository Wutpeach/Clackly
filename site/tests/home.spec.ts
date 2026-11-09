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
      // Static visual evidence; motion is exercised independently below.
      await page.emulateMedia({ reducedMotion: 'reduce' });
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

test('the light opens once while the title and download stay stable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  const phases = await page.locator('.hero-light').evaluate(el => {
    const animation = el.getAnimations()[0];
    if (!animation) throw new Error('The light entrance is missing');
    animation.pause();
    const duration = Number(animation.effect!.getComputedTiming().duration);
    const samples = [0, duration / 2, duration].map(time => {
      animation.currentTime = time;
      const style = getComputedStyle(el);
      return { opacity: Number(style.opacity), mask: style.maskPosition };
    });
    animation.finish();
    return { samples, iterations: animation.effect!.getTiming().iterations };
  });
  expect(phases.iterations).toBe(1);
  expect(phases.samples[0].opacity).toBeLessThan(phases.samples[1].opacity);
  expect(phases.samples[1].opacity).toBeLessThan(phases.samples[2].opacity);
  expect(phases.samples[0].mask).not.toBe(phases.samples[2].mask);
  await expect(page.locator('.hero-copy .primary')).toBeVisible();
  expect(await page.locator('.hero-copy').evaluate(el => getComputedStyle(el).transform)).toBe('none');
});

test('scrolling reveals products once and keyboard focus exposes an unrevealed action immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  const product = page.locator('.search-feature');
  expect(await product.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.5);
  await product.scrollIntoViewIfNeeded();
  await expect.poll(() => product.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  await expect.poll(() => product.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await page.evaluate(() => scrollTo(0, 0));
  await product.scrollIntoViewIfNeeded();
  expect(await product.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  await page.locator('.ai-copy a').focus();
  expect(await page.locator('.ai-section').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
});

test('reduced motion keeps the light and scrolled content fully visible without spatial animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('#preview-launcher')).toBeVisible();
  expect(await page.locator('.hero-light').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('.hero-light').evaluate(el => getComputedStyle(el).maskImage)).toBe('none');
  const products = await page.locator('[data-reveal]').evaluateAll(elements => elements.map(el => {
    const style = getComputedStyle(el);
    return { opacity: style.opacity, transform: style.transform, filter: style.filter };
  }));
  for (const product of products) expect(product).toEqual({ opacity: '1', transform: 'none', filter: 'none' });
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
  expect(await page.locator('.ai-section').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  await context.close();
});
