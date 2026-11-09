import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(site, 'dist');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat();
}
const built = await files(dist);
const existing = new Set(built.map(p => path.relative(dist, p).replaceAll('\\', '/')));
const pages = new Map(await Promise.all(built.filter(p => p.endsWith('.html')).map(async p => [path.relative(dist, p).replaceAll('\\', '/'), await readFile(p, 'utf8')])));
for (const route of ['index.html', 'en/index.html', 'docs/index.html', 'en/docs/index.html', 'docs/developer/prompts/index.html', 'en/docs/developer/prompts/index.html']) {
  assert(pages.has(route), 'Missing required route: ' + route);
  assert.doesNotMatch(pages.get(route), /http-equiv\s*=\s*['"]refresh/i, 'Unexpected redirect: ' + route);
}
for (const route of ['index.html', 'en/index.html']) {
  assert.match(pages.get(route), /releases\/tag\/v0\.1\.6/);
  assert.match(pages.get(route), /Build with AI/);
  assert.match(pages.get(route), /name="description"/);
}
const origin = 'https://wutpeach.github.io';
const base = '/Clackly/';
const decode = t => t.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"');
const ids = new Map([...pages].map(([p, h]) => [p, new Set([...h.matchAll(/\bid="([^"]+)"/g)].map(m => decode(m[1])))]));
function targetFor(url) {
  const pathname = decodeURIComponent(url.pathname);
  assert(pathname.startsWith(base), 'Local URL lost /Clackly/ base: ' + url.href);
  const relative = pathname.slice(base.length);
  if (relative === '404/' || relative === 'en/404/') return '404.html';
  if (existing.has(relative + '/index.html')) return relative + '/index.html';
  return pathname.endsWith('/') ? relative + 'index.html' : relative;
}
assert.equal(targetFor(new URL(base + 'en/docs/', origin)), 'en/docs/index.html');
assert.throws(() => targetFor(new URL(origin + '/docs/')));
for (const route of ['index.html', 'en/index.html']) {
  const image = pages.get(route).match(/property="og:image" content="([^"]+)"/);
  assert(image, 'Missing social image: ' + route);
  assert(existing.has(targetFor(new URL(decode(image[1])))), 'Missing social image asset: ' + route);
}
let checked = 0;
for (const [name, html] of pages) {
  assert.match(html, /href="\/Clackly\/favicon[.]svg\?v=0e879fa7"/, 'Missing R1 SVG favicon: ' + name);
  assert.match(html, /href="\/Clackly\/favicon[.]ico\?v=9980b5a6"/, 'Missing R1 ICO fallback: ' + name);
  const route = name.endsWith('index.html') ? name.slice(0, -10) : name;
  const current = new URL(base + route, origin);
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(decode(m[1]), current);
    if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)) continue;
    const target = targetFor(url);
    assert(existing.has(target), name + ' links to missing ' + m[1]);
    if (url.hash && ids.has(target)) assert(ids.get(target).has(decodeURIComponent(url.hash.slice(1))), name + ' has missing fragment ' + m[1]);
    checked++;
  }
}
for (const [file, hash] of Object.entries({
  'clackly-compact.svg': 'ab49c6f5701d6192ec1e94ca24881729192533e8f9e2d4cb0bee7046713e8d32',
  'favicon.svg': '0e879fa718acb992e51ac848e898a586e84ade72c28991d143ace1b2efce4b3c',
  'favicon.ico': '9980b5a6b326f79765dac5eb02e5e5e071438ce6f2fbd29341f577f6765a9d4e',
})) assert.equal(createHash('sha256').update(await readFile(path.join(dist, file))).digest('hex'), hash, 'Approved R1 asset changed: ' + file);
const zh = [...pages.keys()].filter(p => p.startsWith('docs/'));
const en = [...pages.keys()].filter(p => p.startsWith('en/docs/')).map(p => p.slice(3));
assert.deepEqual(zh.sort(), en.sort(), 'Bilingual route coverage differs');
const inventory = JSON.parse(await readFile(path.join(dist, 'agent/clackly-developer/inventory.json'), 'utf8'));
for (const item of inventory.files) {
  const exported = await readFile(path.join(dist, 'agent/clackly-developer', item.path));
  const source = await readFile(path.join(site, '../skills/clackly-developer', item.path));
  assert(exported.equals(source), 'Skill export differs from authority: ' + item.path);
  assert.equal(createHash('sha256').update(exported).digest('hex'), item.sha256);
}
for (const m of (await readFile(path.join(dist, 'llms.txt'), 'utf8')).matchAll(/https:\/\/wutpeach.github.io\/Clackly\/([^\s]+)/g)) assert(existing.has(m[1]), 'Missing machine source: ' + m[1]);
// CSS assets are not necessarily linked in HTML (font/base-path regressions).
for (const file of built.filter(p => p.endsWith('.css'))) {
  const current = new URL(base + path.relative(dist, file).replaceAll('\\', '/'), origin);
  for (const m of (await readFile(file, 'utf8')).matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) {
    const url = new URL(m[1], current);
    if (url.origin === origin) assert(existing.has(targetFor(url)), 'Missing CSS asset: ' + url.href);
  }
}
console.log(JSON.stringify({ htmlPages: pages.size, bilingualPairs: zh.length, localLinksAssetsFragments: checked, exactSkillSources: inventory.files.length }, null, 2));
