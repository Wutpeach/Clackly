import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { baselineSha, repository, publicSite, progressPaths, readProgress, synchronize, github, documentationOnly, needsPages } from './docs-sync.mjs';
import { check } from './schedule-checks/clackly-docs-sync.mjs';
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40), d = 'd'.repeat(40);

function directory(t) {
  const root = mkdtempSync(join(tmpdir(), 'clackly-docs-sync-'));
  t.after(() => {
    assert.equal(resolve(root).startsWith(resolve(tmpdir())), true);
    assert.match(root, /clackly-docs-sync-/);
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function fixture(t) {
  const root = directory(t);
  let main = a, prs = [], head = b, files = ['site/src/content/docs/docs/faq.md'];
  let deployment = null, runs = [], dispatches = 0;
  const pr = { number: 31, url: 'https://github.com/Wutpeach/Clackly/pull/31', state: 'OPEN', draft: false,
    headRefOid: b, headRefName: 'docs/sync-recovery', baseRefName: 'main', files, mergeCommit: null };
  const api = {
    main: () => main, isAncestor: () => true, filesBetween: () => [], branch: () => ({ sha: head, files }), find: () => prs,
    create: () => { prs.push(pr); }, pr: () => pr, ci: () => [{ sha: head, url: 'https://github.com/Wutpeach/Clackly/actions/runs/1' }],
    verifyCi: receipts => { assert.ok(receipts?.length, 'durable pre-merge CI receipt'); return receipts; },
    assertMergeable: () => {}, assertBaseProtected: () => {}, merge: (_number, expected) => { assert.equal(pr.headRefOid, expected); pr.state = 'MERGED'; pr.mergeCommit = { oid: c }; main = c; },
    deployed: () => deployment, publicPages: () => [{ url: publicSite, status: 200 }],
    dispatch: () => { dispatches++; runs = [{ id: dispatches, status: 'in_progress', conclusion: null }]; }, publishRuns: () => runs,
  };
  const input = { from: baselineSha, through: a, baselineSha, topic: 'recovery', title: 'Docs', body: 'Refs #11',
    reason: 'Actual reviewed range and product facts checked', evidence: ['https://github.com/Wutpeach/Clackly/issues/11'] };
  const call = (command, patch = {}) => synchronize(root, command, { ...input,
    from: readProgress(root).state.reviewedThroughSha ?? baselineSha, through: main, ...patch }, api);
  const review = (patch = {}) => call('review', { headSha: head, verdict: 'PASS', model: 'codex/gpt-6.1-terra',
    effort: 'max', permissions: 'full-access', workerSessionId: 'independent-cindy-worker', ...patch });
  return { root, api, pr, input, call, review, progress: () => readProgress(root), prs: () => prs,
    cursor: () => readProgress(root).cursor, main: value => { main = value; },
    head: value => { head = value; pr.headRefOid = value; },
    files: value => { files = value; pr.files = value; },
    runs: value => { runs = value; }, dispatches: () => dispatches,
    deployed: () => { deployment = { id: 1, sha: main, runId: 1, runUrl: 'https://github.com/Wutpeach/Clackly/actions/runs/1' }; },
  };
}

test('status is read-only and first completion requires a reviewed public baseline', async t => {
  const f = fixture(t);
  assert.equal((await f.call('status')).cursor, null); assert.deepEqual(readdirSync(f.root), []);
  await assert.rejects(f.call('complete', { baselineSha: undefined }), /public Pages baseline/);
  assert.equal(f.cursor(), null);
  await f.call('complete');
  assert.equal(f.cursor(), a); assert.equal(check(f.root, () => a), 2); assert.equal(check(f.root, () => b), 0);
  await f.call('complete'); assert.equal(f.progress().state.reviews.length, 1);
});
test('publishing and a lost create response recover exactly one PR without advancing progress', async t => {
  const f = fixture(t), create = f.api.create;
  f.api.create = (...args) => { create(...args); throw new Error('response lost'); };
  assert.equal((await f.call('publish')).number, 31);
  assert.equal((await f.call('publish')).number, 31);
  assert.equal(f.prs().length, 1); assert.equal(f.cursor(), null);
});
test('failed creation and lost discovery preserve durable intent and can resume', async t => {
  const f = fixture(t), create = f.api.create;
  f.api.create = () => { throw new Error('offline'); };
  await assert.rejects(f.call('publish'), /offline/);
  assert.equal(f.progress().state.pending.phase, 'publishing'); assert.equal(f.cursor(), null);
  f.api.create = create; await f.call('publish');
  assert.equal(f.prs().length, 1); assert.equal(f.progress().state.pending.phase, 'awaiting_review');
});
test('lost receipt can recover a PR merged by somebody else even after branch deletion', async t => {
  const f = fixture(t), find = f.api.find, create = f.api.create;
  f.api.create = () => { create(); f.api.find = () => { throw new Error('discovery offline'); }; throw new Error('lost'); };
  await assert.rejects(f.call('publish'), /discovery offline/);
  f.api.find = find; f.pr.state = 'MERGED'; f.pr.mergeCommit = { oid: c }; f.main(c);
  f.api.branch = () => { throw new Error('branch deleted'); };
  const recovered = await f.call('publish');
  assert.equal(recovered.phase, 'merged'); assert.equal(recovered.number, 31); assert.equal(f.prs().length, 1);
  await assert.rejects(f.call('complete'), /Worker PASS/); assert.equal(f.cursor(), null);
});
test('closed pending PR cannot silently spawn a replacement or another topic', async t => {
  const f = fixture(t); await f.call('publish'); f.pr.state = 'CLOSED';
  await assert.rejects(f.call('publish'), /closed or merged/);
  await assert.rejects(f.call('publish', { topic: 'another' }), /existing pending/);
  assert.equal(f.prs().length, 1); assert.equal(f.cursor(), null);
});
test('current independent PASS and CI are required before an exact-HEAD merge', async t => {
  const f = fixture(t); await f.call('publish');
  await assert.rejects(f.call('merge'), /Worker PASS/);
  await f.review({ verdict: 'REPAIR' }); await assert.rejects(f.call('merge'), /Worker PASS/);
  await assert.rejects(f.review({ model: 'some-other-model' }), /actual independent Worker/);
  await f.review();
  const ci = f.api.ci; f.api.ci = () => { throw new Error('CI pending'); };
  await assert.rejects(f.call('merge'), /CI pending/); assert.equal(f.pr.state, 'OPEN');
  f.api.ci = ci; await f.call('merge');
  assert.equal(f.pr.state, 'MERGED'); assert.equal(f.progress().state.pending.mergeSha, c); assert.equal(f.cursor(), null);
});
test('HEAD changes invalidate old approval and publication resets its receipt', async t => {
  const f = fixture(t); await f.call('publish'); await f.review(); f.head(d);
  await assert.rejects(f.call('merge'), /HEAD.base changed/);
  await f.call('publish'); assert.equal(f.progress().state.pending.review, null);
  await assert.rejects(f.call('merge'), /Worker PASS/); assert.equal(f.cursor(), null);
});
test('a lost successful merge reply can be recovered after main moved to the merge', async t => {
  const f = fixture(t); await f.call('publish'); await f.review();
  const merge = f.api.merge, pr = f.api.pr;
  f.api.merge = (...args) => { merge(...args); f.api.pr = () => { throw new Error('receipt offline'); }; throw new Error('merge reply lost'); };
  await assert.rejects(f.call('merge'), /receipt offline/);
  assert.equal(f.progress().state.pending.phase, 'merging');
  f.api.pr = pr; await f.call('merge'); assert.equal(f.progress().state.pending.mergeSha, c); assert.equal(f.cursor(), null);
});
test('Pages failures and public HTTP failures retain pending and never acknowledge main', async t => {
  const f = fixture(t); await f.call('publish'); await f.review(); await f.call('merge');
  await assert.rejects(f.call('complete'), /Pages deployment/);
  assert.equal(f.cursor(), null); assert.equal(f.progress().state.pending.phase, 'merged');
  f.deployed(); const pages = f.api.publicPages; f.api.publicPages = () => { throw new Error('public HTTP 404'); };
  await assert.rejects(f.call('complete'), /HTTP 404/); assert.equal(f.cursor(), null);
  f.api.publicPages = pages; await f.call('complete');
  assert.equal(f.cursor(), c); assert.equal(f.progress().state.pending, null);
  assert.equal(f.progress().state.reviews[0].pullRequest.deployment.required, true);
});
test('non-site documentation completes without a Pages dispatch', async t => {
  const f = fixture(t); f.files(['docs/operator.md']); await f.call('publish'); await f.review(); await f.call('merge');
  assert.deepEqual(await f.call('deploy'), { required: false }); await f.call('complete');
  assert.equal(f.cursor(), c); assert.equal(f.dispatches(), 0);
  assert.equal(f.progress().state.reviews[0].pullRequest.deployment.required, false);
});
test('lost Pages dispatch receipt recovers one run and never blindly dispatches again', async t => {
  const f = fixture(t); await f.call('publish'); await f.review(); await f.call('merge');
  const dispatch = f.api.dispatch; f.api.dispatch = () => { dispatch(); throw new Error('dispatch response lost'); };
  await assert.rejects(f.call('deploy'), /response lost/);
  const recovered = await f.call('deploy'); assert.equal(recovered.waiting, true); assert.equal(recovered.runId, 1);
  assert.equal(f.dispatches(), 1);
  f.runs([]); await assert.rejects(f.call('deploy'), /outcome unknown/); assert.equal(f.dispatches(), 1);
  f.runs([{ id: 1, status: 'completed', conclusion: 'failure' }]);
  await assert.rejects(f.call('deploy'), /explicitly authorize/);
  f.api.dispatch = dispatch; await f.call('deploy', { retryDeploy: true }); assert.equal(f.dispatches(), 2);
  f.runs([{ id: 2, status: 'completed', conclusion: 'failure' }]);
  await assert.rejects(f.call('deploy', { retryDeploy: true }), /retry already used/); assert.equal(f.dispatches(), 2);
  f.deployed(); assert.equal((await f.call('deploy')).phase, 'succeeded');
  await f.call('complete'); assert.equal(f.cursor(), c);
});
test('main movement, divergent history and omitted review ranges block progress', async t => {
  const f = fixture(t);
  await assert.rejects(f.call('complete', { through: b }), /main moved/);
  await assert.rejects(f.call('complete', { from: b }), /exact reviewed/);
  f.api.isAncestor = () => false; await assert.rejects(f.call('complete'), /not an ancestor/);
  assert.equal(f.cursor(), null);
});
test('state corruption, foreign repositories and cursor-only copies fail closed without overwriting evidence', async t => {
  const f = fixture(t), p = progressPaths(f.root);
  writeFileSync(p.state, '{broken');
  await assert.rejects(synchronize(f.root, 'status', {}, f.api)); assert.equal(readFileSync(p.state, 'utf8'), '{broken');
  await assert.rejects(synchronize(f.root, 'failure', { reason: 'must not overwrite' }, f.api));
  assert.equal(readFileSync(p.state, 'utf8'), '{broken');
  const foreign = { ...readProgress(fixture(t).root).state, repository: 'Wutpeach/Ameow' };
  writeFileSync(p.state, JSON.stringify(foreign));
  assert.throws(() => check(f.root, () => a), /Unrecognized Clackly/);
  unlinkSync(p.state); writeFileSync(p.cursor, a);
  assert.throws(() => check(f.root, () => a), /state is missing/);
});
test('unknown locks are preserved and overlapping operations are blocked', async t => {
  const f = fixture(t), lock = progressPaths(f.root).lock;
  mkdirSync(lock); writeFileSync(join(lock, 'owner.json'), 'owned by another run');
  await assert.rejects(f.call('complete'), /EEXIST/);
  assert.equal(readFileSync(join(lock, 'owner.json'), 'utf8'), 'owned by another run');
  assert.throws(() => check(f.root, () => a), /lock exists/); assert.equal(f.cursor(), null);
});
test('interrupted SHA mirror writes recover from a completed receipt without duplicate history', async t => {
  const f = fixture(t); await f.call('complete');
  unlinkSync(progressPaths(f.root).cursor);
  assert.equal(f.progress().cursorRepairNeeded, true); assert.equal(check(f.root, () => a), 0);
  await f.call('complete'); assert.equal(f.cursor(), a); assert.equal(f.progress().state.reviews.length, 1);
});
test('schedule identity binds only from an actual supplied ID and rejects later mismatches', async t => {
  const f = fixture(t); assert.equal(f.progress().state.scheduleId, null);
  await f.call('complete', { scheduleId: 'actual-clackly-schedule' });
  await assert.rejects(f.call('complete', { scheduleId: 'some-other-schedule' }), /identity changed/);
  assert.equal(f.progress().state.scheduleId, 'actual-clackly-schedule'); assert.equal(f.cursor(), a);
});
test('scope rejects runtime/schema changes and renamed source paths while including generated Skill inputs for Pages', () => {
  for (const files of [['resolve-command-center/electron/main/window.js'], ['skills/clackly-developer/schema.json'],
    ['skills/clackly-developer/examples/run-summary/main.py'], ['docs/moved.md', 'resolve-command-center/old.js'], []]) {
    assert.equal(documentationOnly(files), false);
  }
  assert.equal(documentationOnly(['skills/clackly-developer/SKILL.md']), true);
  assert.equal(needsPages(['skills/clackly-developer/SKILL.md']), true);
});
test('GitHub CI adapter requires successful workflows for the same HEAD', () => {
  let runs = ['main.yml', 'docs-sync.yml', 'deploy-docs.yml'].map((file, i) => ({ id: i + 1, path: '.github/workflows/' + file,
    head_sha: b, head_branch: 'docs/sync-recovery', status: 'completed', conclusion: 'success', html_url: 'https://github.com/run/' + i,
    pull_requests: [{ number: 31, head: { sha: b }, base: { sha: a } }] }));
  const api = github('unused', () => JSON.stringify([{ workflow_runs: runs }]));
  assert.equal(api.ci(b, true, a, 31).length, 3);
  assert.throws(() => api.ci(b, true, d, 31), /matching reviewed PR base/);
  runs = runs.map(r => ({ ...r, head_sha: c })); assert.throws(() => api.ci(b, true, a, 31), /Required CI/);
});

test('new main requires branch integration and invalidates even an unchanged HEAD review', async t => {
  const f = fixture(t); await f.call('publish'); await f.review(); f.main(d);
  f.api.isAncestor = (from, through) => !(from === d && through === b);
  await assert.rejects(f.call('publish'), /Merge current main/);
  await assert.rejects(f.call('merge'), /main moved since publication/);
  f.api.isAncestor = () => true; await f.call('publish');
  assert.equal(f.progress().state.pending.review, null);
  await assert.rejects(f.call('merge'), /Worker PASS/); assert.equal(f.pr.state, 'OPEN');
});

test('completion verifies durable CI run receipts after GitHub removes mutable PR associations', async t => {
  const f = fixture(t);
  let associations = [{ number: 31, head: { sha: b }, base: { sha: a } }], conclusion = 'success';
  const runs = ['main.yml', 'docs-sync.yml', 'deploy-docs.yml'].map((file, i) => ({ id: i + 1, path: '.github/workflows/' + file,
    head_sha: b, head_branch: 'docs/sync-recovery', status: 'completed', event: 'pull_request', html_url: 'https://github.com/run/' + i }));
  const adapter = github('unused', (_program, args) => {
    if (args.at(-1).includes('head_sha=')) return JSON.stringify([{ workflow_runs: runs.map(r => ({ ...r, conclusion, pull_requests: associations })) }]);
    const id = Number(args.at(-1).split('/').at(-1));
    return JSON.stringify({ ...runs.find(r => r.id === id), conclusion, pull_requests: [] });
  });
  f.api.ci = adapter.ci; f.api.verifyCi = adapter.verifyCi;
  await f.call('publish'); await f.review(); await f.call('merge'); f.deployed();
  assert.equal(f.progress().state.pending.ci.length, 3);
  associations = []; assert.throws(() => adapter.ci(b, true, a, 31), /matching reviewed PR base/);
  conclusion = 'failure'; await assert.rejects(f.call('complete'), /Recorded CI run/); assert.equal(f.cursor(), null);
  conclusion = 'success'; await f.call('complete');
  assert.equal(f.cursor(), c); assert.equal(f.progress().state.pending, null);
  const receipts = f.progress().state.reviews[0].pullRequest.ci;
  assert.equal(receipts.length, 3); assert.equal(receipts[0].baseSha, a);
  assert.throws(() => adapter.verifyCi(receipts.map(r => ({ ...r, baseSha: d })), b, true, a, 31), /matching PR.HEAD.base/);
  assert.throws(() => adapter.verifyCi(undefined, b, true, a, 31), /No durable pre-merge/);
});

test('server-side strict protection is mandatory even when all client checks pass', async t => {
  const f = fixture(t); await f.call('publish'); await f.review();
  f.api.assertBaseProtected = () => { throw new Error('no strict server-side protection'); };
  await assert.rejects(f.call('merge'), /server-side/);
  assert.equal(f.pr.state, 'OPEN'); assert.equal(f.cursor(), null);
  let protectedBranch = false, strict = false, admins = true, contexts = ['Docs Sync (ubuntu-latest)', 'Docs Sync (windows-latest)'];
  const api = github('unused', (_program, args) => JSON.stringify(args.at(-1).endsWith('/protection')
    ? { required_status_checks: { strict, contexts }, enforce_admins: { enabled: admins } } : { protected: protectedBranch }));
  assert.throws(() => api.assertBaseProtected(), /lacks strict/);
  protectedBranch = true; assert.throws(() => api.assertBaseProtected(), /up-to-date/);
  strict = true; admins = false; assert.throws(() => api.assertBaseProtected(), /administrators/);
  admins = true; contexts = contexts.slice(0, 1); assert.throws(() => api.assertBaseProtected(), /both OSes/);
  contexts.push('Docs Sync (windows-latest)'); api.assertBaseProtected();
});

test('old deployment cannot acknowledge later Pages changes, with or without pending', async t => {
  const f = fixture(t); await f.call('publish'); await f.review(); await f.call('merge'); f.deployed(); f.main(d);
  f.api.filesBetween = (from, through) => from !== through ? ['site/src/pages/index.astro'] : [];
  await assert.rejects(f.call('complete'), /Pages deployment/);
  assert.equal(f.cursor(), null); assert.notEqual(f.progress().state.pending, null);
  f.deployed(); await f.call('complete'); assert.equal(f.cursor(), d);
  const other = fixture(t); other.api.filesBetween = () => ['skills/clackly-developer/SKILL.md'];
  await assert.rejects(other.call('complete'), /without a covering successful deployment/);
  assert.equal(other.cursor(), null);
  other.deployed(); other.api.filesBetween = (from, through) => from === through ? [] : ['site/src/pages/index.astro'];
  await other.call('complete'); assert.equal(other.cursor(), a);
  assert.equal(other.progress().state.reviews[0].mainDeployment.sha, a);
  const docsOnly = fixture(t); docsOnly.api.filesBetween = () => ['docs/operator.md'];
  await docsOnly.call('complete'); assert.equal(docsOnly.cursor(), a); assert.equal(docsOnly.dispatches(), 0);
});
test('GitHub PR adapter checks pagination completeness and both rename paths', () => {
  let count = 2;
  const api = github('unused', (_program, args) => {
    const endpoint = args.at(-1);
    if (endpoint.endsWith('/pulls/31')) return JSON.stringify({ changed_files: count, state: 'open', draft: false,
      head: { sha: b, ref: 'docs/sync-recovery' }, base: { ref: 'main' } });
    return JSON.stringify([[{ filename: 'docs/moved.md', previous_filename: 'resolve-command-center/runtime.js' }], [{ filename: 'README.md' }]]);
  });
  assert.equal(documentationOnly(api.pr(31).files), false);
  count = 3; assert.throws(() => api.pr(31), /incomplete/);
});
test('completed topics require an explicit new round with a genuinely new HEAD', async t => {
  const f = fixture(t); f.files(['docs/operator.md']);
  await f.call('publish'); await f.review(); await f.call('merge'); await f.call('complete');
  const history = [{ ...f.pr }];
  f.api.find = () => history; f.api.pr = number => history.find(p => p.number === number);
  await assert.rejects(f.call('publish', { newRound: true }), /new HEAD/);
  f.head(d);
  await assert.rejects(f.call('publish'), /explicit new round/);
  f.api.create = () => history.push({ ...f.pr, number: 32, state: 'OPEN', mergeCommit: null });
  assert.equal((await f.call('publish', { newRound: true })).number, 32);
  assert.equal((await f.call('publish')).number, 32); assert.equal(history.length, 2); assert.equal(f.cursor(), c);
});
test('mergeability blocks unresolved review threads and requested changes', () => {
  let decision = 'APPROVED', resolved = false;
  const api = github('unused', () => JSON.stringify([{ data: { repository: { pullRequest: {
    mergeable: 'MERGEABLE', reviewDecision: decision, reviewThreads: { nodes: [{ isResolved: resolved }] },
  } } } }]));
  assert.throws(() => api.assertMergeable(31), /unresolved/);
  resolved = true; decision = 'CHANGES_REQUESTED'; assert.throws(() => api.assertMergeable(31), /requested changes/);
  decision = 'APPROVED'; api.assertMergeable(31);
});
test('Pages receipt must bind successful manual Actions, main SHA and production environment', async () => {
  let conclusion = 'failure', deploySha = c, statusState = 'success';
  const api = github('unused', (program, args) => {
    if (program === 'git') return '';
    const endpoint = args.at(-1);
    if (endpoint.includes('/deployments?')) return JSON.stringify([[{ id: 7, ref: 'main', sha: deploySha }]]);
    if (endpoint.includes('/statuses?')) return JSON.stringify([{ state: statusState, environment_url: publicSite,
      log_url: 'https://github.com/Wutpeach/Clackly/actions/runs/99', url: 'https://api.github.com/status/7' }]);
    if (endpoint.includes('/actions/runs/99')) return JSON.stringify({ id: 99, head_sha: c, head_branch: 'main',
      event: 'workflow_dispatch', path: '.github/workflows/deploy-docs.yml', status: 'completed', conclusion, html_url: 'https://github.com/run/99' });
    throw new Error('Unexpected request');
  });
  assert.equal(await api.deployed(c, c), null);
  conclusion = 'success'; assert.equal((await api.deployed(c, c)).runId, 99);
  deploySha = d; assert.equal(await api.deployed(c, d), null);
  deploySha = c; statusState = 'failure'; assert.equal(await api.deployed(c, c), null);
});
test('public page checks validate all four actual entry routes and reject incorrect HTML', async () => {
  let good = true;
  const api = github('unused', undefined, async url => ({ ok: true, status: 200, url,
    text: async () => good ? '<title>Clackly Documentation</title>' : '<title>Page Not Found</title>' }));
  assert.deepEqual((await api.publicPages()).map(p => p.url), ['', 'en/', 'docs/', 'en/docs/'].map(p => publicSite + p));
  good = false; await assert.rejects(api.publicPages(), /Unexpected public page/);
});
test('Pages dispatch pins the reviewed SHA and refuses an already moved main', () => {
  let main = c, dispatched = null;
  const api = github('unused', (_program, args) => {
    if (args[0] === 'api') return JSON.stringify({ sha: main });
    dispatched = args; return '';
  });
  api.dispatch(c); assert.equal(dispatched.includes('expected_sha=' + c), true);
  assert.equal(dispatched.includes('publish=true'), true);
  main = d; dispatched = null; assert.throws(() => api.dispatch(c), /main moved/); assert.equal(dispatched, null);
});
test('real Git ancestry prevents acknowledging an unrelated repository history', async t => {
  const root = directory(t);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '--initial-branch=main']); git(['config', 'user.name', 'Clackly isolated test']); git(['config', 'user.email', 'test@example.invalid']);
  git(['commit', '--allow-empty', '-m', 'isolated root']); const first = git(['rev-parse', 'HEAD']);
  git(['commit', '--allow-empty', '-m', 'unreviewed commit']); const second = git(['rev-parse', 'HEAD']);
  const api = github(root, (program, args) => program === 'git' ? git(args) : JSON.stringify({ sha: second }));
  assert.equal(api.isAncestor(first, second), true); assert.equal(api.isAncestor(second, first), false);
  await assert.rejects(synchronize(root, 'complete', { from: baselineSha, through: second, baselineSha, reason: 'must reject', evidence: ['isolated'] }, api), /not an ancestor/);
  assert.equal(existsSync(progressPaths(root).cursor), false);
});
