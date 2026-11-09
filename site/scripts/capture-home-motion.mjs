// Record the actual production preview; no page animation or UI is substituted.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
try {
  await mkdir('test-results/motion', { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference',
    recordVideo: { dir: 'test-results/motion', size: { width: 1200, height: 800 } },
  });
  const page = await context.newPage();
  const video = page.video();
  await page.goto('http://127.0.0.1:4321/Clackly/');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/motion/light-early.png' });
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/motion/light-middle.png' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/motion/light-settled.png' });
  for (const selector of ['.product-stage', '.section-heading', '.search-feature', '.extension-feature', '.ai-section']) {
    await page.locator(selector).evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await page.waitForTimeout(1600);
  }
  await context.close();
  await mkdir('evidence/issue-14', { recursive: true });
  await video.saveAs('evidence/issue-14/motion.webm');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  await phone.goto('http://127.0.0.1:4321/Clackly/');
  await phone.waitForTimeout(1600);
  await phone.locator('.search-feature').evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await phone.waitForTimeout(1400);
  await phone.screenshot({ path: 'test-results/motion/phone-product.png' });
  console.log(JSON.stringify({ video: 'evidence/issue-14/motion.webm', phoneOverflow: await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
} finally { await browser.close(); }
