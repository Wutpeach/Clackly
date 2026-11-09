import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = path.resolve(site, '../skills/clackly-developer');
const raw = path.join(site, 'public/agent/clackly-developer');
const refs = ['extension-v1', 'command-ui', 'prepare', 'views'];
const titles = { 'extension-v1': 'Manifest & lifecycle', 'command-ui': 'Command UI', prepare: 'Dynamic Prepare', views: 'Extension Views · Forms · Batch' };
// Only these generated subtrees are ever removed; source and authored guides stay outside them.
for (const target of [raw, ...['docs', 'en/docs'].map(p => path.join(site, 'src/content/docs', p, 'developer/reference'))]) {
  assert(target.startsWith(site + path.sep) && target !== site);
  await rm(target, { recursive: true, force: true });
}
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(path.join(dir, entry.name), relative + '/'));
    else if (/\.(md|py|json)$/.test(entry.name)) result.push(relative);
  }
  return result.sort();
}
const inventory = [];
for (const relative of await files(source)) {
  const bytes = await readFile(path.join(source, relative));
  const output = path.join(raw, relative);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  inventory.push({ path: relative, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(raw, 'inventory.json'), JSON.stringify({ source: 'skills/clackly-developer', files: inventory }, null, 2) + '\n');
for (const locale of ['docs', 'en/docs']) {
  const en = locale.startsWith('en/');
  const dir = path.join(site, 'src/content/docs', locale, 'developer/reference');
  await mkdir(dir, { recursive: true });
  for (const ref of refs) {
    const relative = 'references/' + ref + '.md';
    const text = await readFile(path.join(source, relative), 'utf8');
    // Preserve the actual source as raw bytes. Only presentation links change in the HTML view.
    const rendered = text.replace(/^# .+\r?\n/, '').replace(/(\[[^\]]+\])\(([^)]+)\)/g, (all, label, href) => {
      if (/^(https?:|#)/.test(href)) return all;
      const resolved = path.posix.normalize(path.posix.join('references', href));
      assert(!resolved.startsWith('../'));
      return label + '(/Clackly/agent/clackly-developer/' + resolved + ')';
    });
    const intro = en
      ? 'Generated from the official Developer Skill at build time. The protocol below is the original English reference. v0.1.6 publicly ships these capabilities; verify the installed target Host before delivery.'
      : '构建时直接读取官方 Developer Skill。下方协议保留英文原文；v0.1.6 已公开发行这些能力，交付前仍需核对目标 Host。';
    const body = '---\ntitle: ' + JSON.stringify(titles[ref]) + '\ndescription: ' + JSON.stringify(intro) + '\n---\n\n' + intro + '\n\n[Markdown · Copy for Agent](/Clackly/agent/clackly-developer/' + relative + ') · [GitHub source](https://github.com/Wutpeach/Clackly/blob/main/skills/clackly-developer/' + relative + ')\n\n' + rendered;
    await writeFile(path.join(dir, ref + '.md'), body);
  }
}
const intro = '# Clackly developer sources\n\nPublic baseline: Clackly v0.1.7 (2026-11-09). Verify the installed Host; older Hosts can lack UI support.\nProtocol authority: skills/clackly-developer/. Raw files below are byte-for-byte copies generated at build time, not a second specification.\nThird-party Python is unsandboxed. No arbitrary Web UI, background services or automatic rollback.\n\n';
await writeFile(path.join(site, 'public/llms.txt'), intro + inventory.map(f => '- https://wutpeach.github.io/Clackly/agent/clackly-developer/' + f.path).join('\n') + '\n');
console.log('Exported ' + inventory.length + ' exact Developer Skill sources and 8 reference pages.');
