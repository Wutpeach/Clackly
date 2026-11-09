import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { baselineSha, progressPaths, synchronize, readProgress } from '../docs-sync.mjs';
import { check } from './clackly-docs-sync.mjs';
const a = 'a'.repeat(40), b = 'b'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'clackly-precheck-'));
  t.after(() => { assert.equal(resolve(root).startsWith(resolve(tmpdir())), true); assert.match(root, /clackly-precheck-/); rmSync(root, { recursive: true, force: true }); });
  const complete = () => synchronize(root, 'complete', { from: baselineSha, through: a, baselineSha, reason: 'Isolated reviewed range', evidence: ['fixture'] }, { main: () => a, isAncestor: () => true });
  return { root, complete };
}
test('uninitialized check allows bootstrap without creating files', t => {
  const f = fixture(t); assert.equal(check(f.root, () => a), 0); assert.deepEqual(readdirSync(f.root), []);
});
test('same SHA skips and new SHA allows without changing durable progress', async t => {
  const f = fixture(t); await f.complete(); const before = JSON.stringify(readProgress(f.root));
  assert.equal(check(f.root, () => a), 2); assert.equal(check(f.root, () => b), 0);
  assert.equal(JSON.stringify(readProgress(f.root)), before);
});
test('network/timeout/malformed remote results throw instead of returning skip', async t => {
  const f = fixture(t); await f.complete();
  for (const message of ['offline', 'ETIMEDOUT']) assert.throws(() => check(f.root, () => { throw new Error(message); }), new RegExp(message));
  assert.throws(() => check(f.root, () => 'invalid'), /Invalid remote/);
});
test('pending recovery wins even when SHA is unchanged and remote is unavailable', async t => {
  const f = fixture(t); await f.complete(); const p = progressPaths(f.root), state = readProgress(f.root).state;
  state.pending = { topic: 'resume', head: 'docs/sync-resume', through: a, headSha: b, phase: 'awaiting_review', number: 33, historicalPrNumbers: [], review: null };
  writeFileSync(p.state, JSON.stringify(state));
  assert.equal(check(f.root, () => a), 0); assert.equal(check(f.root, () => { throw new Error('offline'); }), 0);
});
test('state corruption and an unknown lock block the check rather than skipping', async t => {
  const f = fixture(t); await f.complete(); writeFileSync(progressPaths(f.root).state, '{broken');
  assert.throws(() => check(f.root, () => a));
  const other = fixture(t); mkdirSync(progressPaths(other.root).lock);
  assert.throws(() => check(other.root, () => a), /lock exists/);
});
test('unresolved failures wake recovery even without new commits', async t => {
  const f = fixture(t); await f.complete();
  await synchronize(f.root, 'failure', { reason: 'Worker BLOCK' }, {});
  assert.equal(check(f.root, () => a), 0);
});

test('real CLI exit codes and marker survive restart, cwd changes, remote changes and failures', async t => {
  const f = fixture(t), scripts = join(f.root, 'scripts'), remote = join(f.root, 'remote');
  mkdirSync(join(scripts, 'schedule-checks'), { recursive: true }); mkdirSync(remote);
  copyFileSync(new URL('../docs-sync.mjs', import.meta.url), join(scripts, 'docs-sync.mjs'));
  const entry = join(scripts, 'schedule-checks', 'clackly-docs-sync.mjs');
  copyFileSync(new URL('./clackly-docs-sync.mjs', import.meta.url), entry);
  const git = args => execFileSync('git', args, { cwd: remote, encoding: 'utf8', windowsHide: true }).trim();
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Docs Sync fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'fixture']);
  const head = git(['rev-parse', 'HEAD']);
  const env = { ...process.env, GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.${pathToFileURL(remote).href}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/Wutpeach/Clackly.git' };
  const run = (status, overrides = {}) => {
    const result = spawnSync(process.execPath, [entry], { cwd: tmpdir(), env: { ...env, ...overrides }, encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.equal(result.status, status, result.stderr);
    assert.equal(result.stdout.trim(), status === 1 ? '' : 'CINDY_PRECHECK_OK');
  };
  run(0);
  await synchronize(f.root, 'complete', { from: baselineSha, through: head, baselineSha, reason: 'Isolated local Git fixture', evidence: ['local fixture only'] }, { main: () => head, isAncestor: () => true });
  run(2);
  git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'new change']); run(0);
  const unavailable = { GIT_CONFIG_KEY_0: `url.${pathToFileURL(join(f.root, 'missing')).href}.insteadOf` };
  run(1, unavailable);
  await synchronize(f.root, 'failure', { reason: 'Isolated pending failure' }, {}); run(0, unavailable);
  writeFileSync(progressPaths(f.root).state, '{broken'); run(1);
});
