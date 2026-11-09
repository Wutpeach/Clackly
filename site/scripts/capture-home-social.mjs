// Capture a sharing composition from the running homepage; no invented product UI.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4321/Clackly/en/');
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'header nav, main > :not(.hero), footer, figcaption, .release, .preview-switch { display: none !important; } header { position: absolute; top: 24px; left: 40px; width: auto !important; min-height: 0 !important; z-index: 10; } .hero-copy { padding: 26px 0 22px !important; } h1 { font-size: 64px !important; } .hero-description { margin: 16px 0 20px !important; } .product-stage { height: 360px !important; } .product-capture { width: 254px !important; right: 25% !important; top: 10px !important; } .stage-copy { top: 30px !important; }' });
  await page.locator('#preview-launcher').evaluate(image => image.decode());
  await page.screenshot({ path: 'public/images/home/social.png', animations: 'disabled' });
  await writeFile('public/images/home/social.png.json', JSON.stringify({ origin: 'Actual built English homepage, sharing composition adapted with CSS', source: 'site/scripts/capture-home-social.mjs', date: '2026-11-09', limitations: 'Product captures use demonstration data; timeline background is a schematic, not Resolve.' }, null, 2) + '\n');
} finally { await browser.close(); }
