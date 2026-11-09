import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const locale of ['', 'en/']) {
  const en = Boolean(locale);
  test((en ? 'English' : 'Chinese') + ' home → docs → AI guide, preserving locale', async ({ page }) => {
    await page.goto('./' + locale);
    await expect(page.locator('html')).toHaveAttribute('lang', en ? 'en' : 'zh-CN');
    await expect(page.getByRole('link', { name: en ? 'Download for Windows' : '下载 Windows 版' })).toHaveAttribute('href', 'https://github.com/Wutpeach/Clackly/releases/tag/v0.1.7');
    await page.locator('header').getByRole('link', { name: en ? 'Documentation' : '使用文档' }).click();
    await expect(page).toHaveURL(new RegExp('/Clackly/' + locale + 'docs/$'));
    const homeLink = page.locator('a.site-title');
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/Clackly/' + locale);
    await expect(homeLink.locator('img')).toBeVisible();
    await expect(homeLink).toHaveText('Clackly');
    await homeLink.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp('/Clackly/' + locale + '$'));
    await page.locator('header').getByRole('link', { name: en ? 'Documentation' : '使用文档' }).click();
    await page.getByRole('link', { name: 'Build with AI', exact: true }).first().click();
    await expect(page.locator('h1')).toContainText('Build with AI');
  });

  test((en ? 'English' : 'Chinese') + ' six Agent prompts copy their full visible text', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./' + locale + 'docs/developer/prompts/');
    const blocks = page.locator('[data-copy-block]');
    await expect(blocks).toHaveCount(6);
    for (const block of await blocks.all()) {
      const text = await block.locator('textarea').inputValue();
      expect(text).toContain('Host');
      expect(text).toContain('package_extension.py');
      await block.locator('[data-copy]').click();
      await expect(block.getByRole('status')).toHaveText(en ? 'Copied' : '已复制');
      expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(text);
    }
  });
}

test('language switching keeps the current documentation page', async ({ page }) => {
  await page.goto('./docs/install/');
  await page.locator('starlight-lang-select select').selectOption('/Clackly/en/docs/install/');
  await expect(page).toHaveURL(/\/en\/docs\/install\/$/);
  await expect(page.locator('h1')).toHaveText('Download and install on Windows');
});

test('clipboard denial leaves selectable text and a recovery instruction', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await page.goto('./docs/developer/prompts/');
  const first = page.locator('[data-copy-block]').first();
  await first.locator('[data-copy]').click();
  await expect(first.getByRole('status')).toHaveText('无法自动复制，请选择下方原文并复制。');
  expect(await first.locator('textarea').evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe((await first.locator('textarea').inputValue()).length);
});

test('protocol Markdown is machine-readable and copies the authoritative source', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = await readFile('../skills/clackly-developer/references/views.md', 'utf8');
  const raw = await request.get('./agent/clackly-developer/references/views.md');
  expect(raw.ok()).toBeTruthy();
  expect(await raw.text()).toBe(source);
  await page.goto('./docs/developer/reference/views/');
  await page.getByText('复制 Markdown 原文给 Agent', { exact: true }).click();
  await page.locator('[data-copy]').click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(source.replaceAll('\r\n', '\n'));
});

test('built search index returns extension documentation', async ({ page }) => {
  await page.goto('./en/docs/');
  await page.locator('site-search [data-open-modal]').click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('extensions');
  await expect(page.locator('.pagefind-ui__result-link').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).not.toBeVisible();
});

test('mobile navigation works with keyboard and opens a real docs page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./docs/');
  const button = page.locator('black-menu-button button');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.mobile-nav').getByRole('link', { name: '下载与安装', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/install\/$/);
});

test('responsive pages load assets without overflow or browser errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  for (const [name, route, width] of [
    ['desktop', '', 1440], ['mobile', '', 390], ['small', '', 320],
    ['desktop-en', 'en/', 1440], ['mobile-en', 'en/', 390],
    ['overview', 'docs/', 1440], ['overview-mobile', 'docs/', 320],
    ['overview-en', 'en/docs/', 1440], ['overview-en-mobile', 'en/docs/', 320],
    ['docs-zh', 'docs/install/', 1440], ['docs-mobile', 'docs/install/', 390],
    ['docs-en', 'en/docs/developer/', 1440], ['docs-en-mobile', 'en/docs/developer/', 320],
    ['prompts', 'docs/developer/prompts/', 1440], ['reference-mobile', 'docs/developer/reference/views/', 390],
  ] as const) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('./' + route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toBeVisible();
    if (route.includes('docs/')) {
      await expect(page.locator('a.site-title img')).toHaveCount(1);
      if (width >= 1024) await expect(page.locator('a.site-title')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' overflows horizontally').toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('new documentation visitors start dark on a light system and keep manual choices', async ({ browser }, testInfo) => {
  for (const locale of ['', 'en/']) {
    const page = await browser.newPage({ baseURL: testInfo.project.use.baseURL, colorScheme: 'light' });
    try {
      await page.goto('./' + locale + 'docs/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.locator('starlight-theme-black-select button').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.locator('.sl-link-card').filter({ hasText: 'Build with AI' }).getByRole('link').click();
      await expect(page).toHaveURL(new RegExp('/Clackly/' + locale + 'docs/developer/$'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    } finally { await page.close(); }
  }
});

test('theme switch persists across the overview to AI guide and remains usable', async ({ page }, testInfo) => {
  for (const locale of ['', 'en/']) {
    await page.goto('./' + locale + 'docs/');
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) {
        const toggle = page.locator('starlight-theme-black-select button');
        await toggle.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('h1')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await page.screenshot({ path: testInfo.outputPath(`overview-${locale ? 'en' : 'zh'}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
      await page.locator('.sl-link-card').filter({ hasText: 'Build with AI' }).getByRole('link').click();
      await expect(page).toHaveURL(new RegExp('/Clackly/' + locale + 'docs/developer/$'));
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.goto('./' + locale + 'docs/');
    }
  }
});

test('long translated navigation labels and mobile reference tables remain readable', async ({ page }) => {
  for (const locale of ['', 'en/']) {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('./' + locale + 'docs/developer/');
    const links = page.locator('.sidebar-content .entry-link');
    const boxes = await links.evaluateAll(items => items.map(item => {
      const box = item.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }));
    expect(boxes.length).toBeGreaterThan(10);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    await page.setViewportSize({ width: 320, height: 960 });
    for (const slug of ['developer/', 'developer/examples/']) {
      await page.goto('./' + locale + 'docs/' + slug);
      const table = page.locator('table');
      await expect(table).toHaveAttribute('tabindex', '0');
      expect(await table.locator('td').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(128);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await table.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
  }
});
