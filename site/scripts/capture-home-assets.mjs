// Developer-only: captures the real built renderer, never a live Resolve project.
import { readFile, writeFile, copyFile, mkdir, unlink, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const exec = promisify(execFile);
const site = fileURLToPath(new URL('../', import.meta.url));
const app = path.resolve(site, '../resolve-command-center');
const out = path.join(site, 'public/images/home');
const scratch = await mkdtemp(path.join(tmpdir(), 'clackly-home-'));
const temporaryHarness = path.join(app, 'scripts', '.home-capture-' + process.pid + '.mjs');
await mkdir(out, { recursive: true });
const { stdout: sha } = await exec('git', ['rev-parse', 'HEAD'], { cwd: site });
const source = (await readFile(path.join(app, 'scripts/palette-evidence.mjs'), 'utf8')).replaceAll('\r\n', '\n');
// Preserve the utility's CSS-pixel assertions; add a separate 2x asset capture.
const capture = source.replaceAll('deviceScaleFactor: 1', 'deviceScaleFactor: 2').replace(
  'return target;\n}',
  'await page.screenshot({ path: target.replace(/\\.png$/, "@2x.png"), scale: "device", animations: "disabled", omitBackground: true });\n  return target;\n}'
);
if (capture === source || !capture.includes('target.replace(/\\.png$/')) throw new Error('Renderer evidence utility changed; review the capture adapter.');
try {
  await writeFile(temporaryHarness, capture);
  await exec(process.execPath, [temporaryHarness, '--renderer', 'built', '--scenario', 'pinned-recent,search-results', '--output', scratch], { cwd: app });
  for (const [from, to] of [['pinned-recent', 'launcher'], ['search-results', 'search']]) {
    await copyFile(path.join(scratch, from + '@2x.png'), path.join(out, to + '.png'));
  }
} finally { await unlink(temporaryHarness); }
const root = path.join(app, 'dist/renderer');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' })[path.extname(file)] || 'text/html');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
try {
  for (const locale of ['en', 'zh-CN']) {
    const page = await browser.newPage({ viewport: { width: 560, height: 380 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript((locale) => {
      const en = locale === 'en';
      const titles = en ? ['Main edit', 'Social cut', 'Trailer', 'Selects'] : ['主剪辑', '社交媒体版', '预告片', '精选素材'];
      const state = { phase: 'ready', serial: 1, version: 1, depth: 1, query: '', filter: '', selectedId: '0',
        extensionName: en ? 'Example extension' : '示例扩展', view: { id: 'timelines', type: 'list',
          title: en ? 'Timeline Browser' : '时间线浏览器', subtitle: en ? 'Demo project · Read-only example' : '演示项目 · 只读示例',
          items: titles.map((title, i) => ({ id: String(i), title, subtitle: en ? 'Demonstration timeline' : '演示时间线', tag: i === 0 ? (en ? 'Current' : '当前') : undefined, actions: [{ id: 'detail', type: 'detail', title: en ? 'View details' : '查看详情' }] })) } };
      window.resolveCommandCenter = { getLocalizationSnapshot: async () => ({ preference: locale, effectiveLocale: locale }), onLocalizationChanged: () => () => {} };
      window.resolveExtensionView = { get: async () => state, onChanged: () => () => {}, select: async () => {}, window: () => {} };
    }, locale);
    await page.goto('http://127.0.0.1:' + server.address().port + '/?view=extension-view');
    await page.locator('[role=option]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(errors.join('\n'));
    await page.screenshot({ path: path.join(out, 'extension-' + (locale === 'en' ? 'en' : 'zh') + '.png'), animations: 'disabled', omitBackground: true });
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
for (const name of ['launcher', 'search', 'extension-en', 'extension-zh']) {
  await writeFile(path.join(out, name + '.png.json'), JSON.stringify({
    origin: 'Actual Clackly renderer, headless Edge, deterministic demonstration data',
    source: 'site/scripts/capture-home-assets.mjs', sourceCheckout: sha.trim(),
    command: 'npm --prefix resolve-command-center run build && node site/scripts/capture-home-assets.mjs',
    date: '2026-11-09', deviceScaleFactor: 2,
    limitations: 'DOM/CSS capture only. Not a native Resolve screenshot or evidence of command execution. Extension content is an illustrative read-only fixture, not an installed bundled extension.'
  }, null, 2) + '\n');
}
console.log('Captured Launcher, Search and bilingual Extension View assets at 2x.');
