// Cindy owns editing and independent review; this module owns progress and external receipts.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export const repository = 'Wutpeach/Clackly';
export const baselineSha = 'bfd03d735744ece331d25b7b4e052a64c232f294';
export const publicSite = 'https://wutpeach.github.io/Clackly/';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const now = () => new Date().toISOString();
const phases = ['publishing', 'awaiting_review', 'merging', 'merged', 'deploying'];
export const progressPaths = root => ({
  state: join(root, '.clackly-docs-reviewed-state.json'),
  cursor: join(root, '.clackly-docs-reviewed-sha'),
  lock: join(root, '.clackly-docs-sync.lock'),
});
export const needsPages = files => files.some(p => p.startsWith('site/')
  || p.startsWith('skills/clackly-developer/') || p === '.github/workflows/deploy-docs.yml');
export const documentationOnly = files => files.length > 0 && files.every(p =>
  !p.split('/').includes('..') && (p.startsWith('site/') || p.startsWith('docs/')
    || ['README.md', 'README.en.md', '.github/workflows/deploy-docs.yml'].includes(p)
    || (p.startsWith('skills/clackly-developer/') && p.endsWith('.md'))));

function optionalRead(file) {
  try { return readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
function atomic(file, content) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  writeFileSync(temporary, content, { flag: 'wx' });
  renameSync(temporary, file);
}
function emptyState() {
  return { schemaVersion: 1, repository, branch: 'main', baselineSha, scheduleId: null,
    reviewedThroughSha: null, reviews: [], pending: null, lastFailure: null };
}
function validateState(state) {
  insist(state && state.schemaVersion === 1 && state.repository === repository && state.branch === 'main'
    && state.baselineSha === baselineSha && (state.scheduleId === null || text(state.scheduleId))
    && (state.reviewedThroughSha === null || sha(state.reviewedThroughSha)) && Array.isArray(state.reviews),
  'Unrecognized Clackly review state; preserve it for inspection');
  for (const review of state.reviews) insist(review && sha(review.reviewedThroughSha)
    && sha(review.fromSha) && text(review.reason) && Array.isArray(review.evidence)
    && review.evidence.length > 0 && review.evidence.every(text), 'Invalid completed review receipt');
  insist((state.reviews.at(-1)?.reviewedThroughSha ?? null) === state.reviewedThroughSha,
    'Review history and durable cursor disagree');
  const p = state.pending;
  if (p !== null) {
    insist(p && /^[a-z0-9][a-z0-9-]{0,60}$/.test(p.topic) && p.head === `docs/sync-${p.topic}`
      && sha(p.through) && sha(p.headSha) && phases.includes(p.phase)
      && Array.isArray(p.historicalPrNumbers) && p.historicalPrNumbers.every(Number.isSafeInteger)
      && (p.number === null || (Number.isSafeInteger(p.number) && p.number > 0)), 'Invalid pending operation');
    insist(p.phase === 'publishing' || p.number !== null, 'Pending operation has no PR identity');
    if (p.review) insist(p.review.headSha === p.headSha && ['PASS', 'REPAIR', 'BLOCK'].includes(p.review.verdict)
      && text(p.review.workerSessionId) && Array.isArray(p.review.evidence) && p.review.evidence.every(text),
    'Invalid independent review receipt');
    if (p.mergeSha) insist(sha(p.mergeSha), 'Invalid merge receipt');
    if (p.deployment) insist(['dispatching', 'observing', 'succeeded'].includes(p.deployment.phase)
      && sha(p.deployment.sha) && text(p.deployment.requestedAt), 'Invalid deployment intent');
  }
  insist(state.lastFailure === null || text(state.lastFailure?.reason), 'Invalid failure record');
}

// Read-only even before initialization. JSON is authoritative; the SHA file mirrors its completed receipt.
export function readProgress(root) {
  const files = progressPaths(root), raw = optionalRead(files.state), mirror = optionalRead(files.cursor);
  const cursor = mirror === null ? null : mirror.trim();
  insist(cursor === null || sha(cursor), 'Invalid review cursor');
  insist(raw !== null || cursor === null, 'Review state is missing beside an existing cursor');
  const state = raw === null ? emptyState() : JSON.parse(raw);
  validateState(state);
  const cursorRepairNeeded = cursor !== state.reviewedThroughSha;
  if (cursorRepairNeeded) insist(state.reviewedThroughSha !== null
    && (cursor === null || state.reviews.some(r => r.reviewedThroughSha === cursor)),
  'Cursor has no completed review receipt; do not reset it');
  return { state, cursor, cursorRepairNeeded, lockExists: existsSync(files.lock) };
}
function passReceipt(pending) {
  const r = pending.review;
  insist(r?.verdict === 'PASS' && r.headSha === pending.headSha
    && r.model === 'codex/gpt-6.1-terra' && r.effort === 'max' && r.permissions === 'full-access',
  'A current independent Cindy Worker PASS is required');
}
function matchingPr(pending, pr) {
  insist(pr && pr.headRefOid === pending.headSha && pr.baseRefName === 'main'
    && pr.headRefName === pending.head, 'PR HEAD/base changed; publish and review the new HEAD');
  insist(Array.isArray(pr.files) && documentationOnly(pr.files), 'PR exceeds documentation scope or has no complete file evidence');
}
function mergedPr(pending, pr) {
  matchingPr(pending, pr);
  insist(pr.state === 'MERGED' && sha(pr.mergeCommit?.oid), 'Pending PR is not merged at its recorded HEAD');
  return pr.mergeCommit.oid;
}

export async function synchronize(root, command, input = {}, api) {
  if (command === 'status') {
    const p = readProgress(root);
    return { repository, baselineSha, scheduleId: p.state.scheduleId, cursor: p.cursor,
      durableCursor: p.state.reviewedThroughSha, cursorRepairNeeded: p.cursorRepairNeeded,
      pending: p.state.pending, lastFailure: p.state.lastFailure, lockExists: p.lockExists };
  }
  insist(['publish', 'review', 'merge', 'deploy', 'complete', 'failure'].includes(command), 'Unknown Docs Sync command');
  const files = progressPaths(root);
  mkdirSync(files.lock); // Unknown or abandoned locks require inspection, never automatic removal.
  let state;
  const save = () => atomic(files.state, JSON.stringify(state, null, 2) + '\n');
  try {
    writeFileSync(join(files.lock, 'owner.json'), JSON.stringify({ pid: process.pid, command, at: now() }));
    state = readProgress(root).state;
    if (input.scheduleId !== undefined) {
      insist(text(input.scheduleId) && (state.scheduleId === null || state.scheduleId === input.scheduleId), 'Schedule identity changed');
      state.scheduleId = input.scheduleId;
    }
    if (command === 'failure') {
      insist(text(input.reason), 'Failure needs a reason');
      state.lastFailure = { at: now(), command, reason: input.reason }; save();
      return { recorded: true, cursorUnchanged: state.reviewedThroughSha };
    }
    if (command === 'review') {
      const p = state.pending;
      insist(p?.number, 'Publish or recover the pending PR before review');
      matchingPr(p, await api.pr(p.number));
      insist(input.headSha === p.headSha && ['PASS', 'REPAIR', 'BLOCK'].includes(input.verdict)
        && input.model === 'codex/gpt-6.1-terra' && input.effort === 'max' && input.permissions === 'full-access'
        && text(input.workerSessionId) && Array.isArray(input.evidence) && input.evidence.length > 0 && input.evidence.every(text),
      'Supply the actual independent Worker configuration, verdict, evidence and exact PR HEAD');
      p.review = { headSha: input.headSha, verdict: input.verdict, model: input.model, effort: input.effort,
        permissions: input.permissions, workerSessionId: input.workerSessionId, evidence: input.evidence, at: now() };
      state.lastFailure = input.verdict === 'PASS' ? null : { at: now(), command, reason: `Worker ${input.verdict}` };
      save(); return p.review;
    }
    const through = input.through, from = state.reviewedThroughSha ?? baselineSha;
    insist(sha(through) && input.from === from, 'Supply the exact reviewed from/through SHA range');
    insist(await api.main() === through, 'main moved; review the missing commits before continuing');
    insist(await api.isAncestor(from, through), 'Reviewed cursor/baseline is not an ancestor of main');
    if (command === 'publish') {
      insist(/^[a-z0-9][a-z0-9-]{0,60}$/.test(input.topic ?? '') && text(input.title) && text(input.body), 'PR topic/title/body are required');
      const head = `docs/sync-${input.topic}`, previous = state.pending;
      insist(!previous || (previous.topic === input.topic && !['merging', 'merged', 'deploying'].includes(previous.phase)),
        'Recover the existing pending operation before publishing another round');
      if (previous && previous.number === null) {
        const recovered = (await api.find(head)).filter(p => !previous.historicalPrNumbers.includes(p.number)
          && p.headRefOid === previous.headSha && p.state === 'MERGED');
        insist(recovered.length <= 1, 'Ambiguous merged PR receipt');
        if (recovered.length === 1) {
          const pr = await api.pr(recovered[0].number);
          const mergeSha = mergedPr(previous, pr);
          state.pending = { ...previous, number: pr.number, url: pr.url, mergeSha, phase: 'merged' };
          state.lastFailure = null; save(); return state.pending;
        }
      }
      const branch = await api.branch(head);
      insist(sha(branch.sha) && documentationOnly(branch.files), 'Changes exceed documentation scope or are empty');
      let prs = await api.find(head);
      const open = prs.filter(p => p.state === 'OPEN');
      insist(open.length <= 1, 'Ambiguous open PRs for the same branch');
      let pr = previous?.number ? prs.find(p => p.number === previous.number) : open[0];
      if (previous?.number) insist(pr && pr.state === 'OPEN', 'Pending PR closed or merged; recover it without creating a replacement');
      if (!pr && previous) {
        const recovered = prs.filter(p => !previous.historicalPrNumbers.includes(p.number) && p.headRefOid === branch.sha);
        insist(recovered.length <= 1, 'Ambiguous lost PR receipt');
        pr = recovered[0];
        if (pr) insist(pr.state !== 'CLOSED', 'Recovered PR was closed unmerged; preserve the pending operation');
      }
      if (!pr && prs.length && !previous) insist(input.newRound === true && prs.every(p => p.headRefOid !== branch.sha),
        'A completed topic needs an explicit new round with a new HEAD');
      state.pending = { topic: input.topic, head, through, headSha: branch.sha, phase: 'publishing', number: pr?.number ?? null,
        historicalPrNumbers: previous?.historicalPrNumbers ?? prs.filter(p => p.state !== 'OPEN').map(p => p.number),
        review: previous?.headSha === branch.sha ? previous.review ?? null : null };
      save();
      if (!pr) {
        try { await api.create(head, input.title, input.body); } catch (error) {
          prs = await api.find(head);
          if (prs.filter(p => !state.pending.historicalPrNumbers.includes(p.number) && p.headRefOid === branch.sha).length !== 1) throw error;
        }
        prs = await api.find(head);
        const candidates = prs.filter(p => !state.pending.historicalPrNumbers.includes(p.number) && p.headRefOid === branch.sha);
        insist(candidates.length === 1 && candidates[0].state !== 'CLOSED', 'Cannot confirm the created PR; preserve publishing intent');
        pr = candidates[0];
      }
      const actual = await api.pr(pr.number);
      matchingPr(state.pending, actual);
      insist(await api.main() === through, 'main moved during publication; review the missing range');
      state.pending = { ...state.pending, number: pr.number, url: actual.url, phase: actual.state === 'MERGED' ? 'merged' : 'awaiting_review' };
      if (actual.state === 'MERGED') state.pending.mergeSha = mergedPr(state.pending, actual);
      state.lastFailure = null; save(); return state.pending;
    }
    const p = state.pending;
    if (command === 'merge') {
      insist(p?.number, 'Recover the pending PR before merging');
      passReceipt(p);
      let pr = await api.pr(p.number); matchingPr(p, pr);
      if (pr.state !== 'MERGED') {
        insist(p.through === through, 'main moved since publication; review and publish the current range');
        insist(pr.state === 'OPEN' && !pr.draft, 'PR is closed or still a draft');
        p.ci = await api.ci(p.headSha, needsPages(pr.files));
        await api.assertMergeable(p.number);
        insist(await api.main() === through, 'main moved before merge');
        p.phase = 'merging'; save();
        try { await api.merge(p.number, p.headSha); } catch (error) {
          pr = await api.pr(p.number);
          if (pr.state !== 'MERGED' || pr.headRefOid !== p.headSha) throw error;
        }
        pr = await api.pr(p.number);
      }
      p.mergeSha = mergedPr(p, pr); p.phase = 'merged'; state.lastFailure = null; save(); return p;
    }
    if (command === 'deploy') {
      insist(p?.number, 'No pending PR to deploy'); passReceipt(p);
      const pr = await api.pr(p.number); p.mergeSha = mergedPr(p, pr);
      insist(await api.isAncestor(p.mergeSha, through), 'Merge is outside the reviewed range');
      if (!needsPages(pr.files)) { p.phase = 'merged'; save(); return { required: false }; }
      const existing = await api.deployed(p.mergeSha, through);
      if (existing) {
        p.deployment = { ...existing, phase: 'succeeded', requestedAt: p.deployment?.requestedAt ?? now() };
        p.phase = 'merged'; state.lastFailure = null; save(); return p.deployment;
      }
      if (p.deployment) {
        const runs = await api.publishRuns(p.deployment.sha, p.deployment.requestedAt);
        insist(runs.length <= 1, 'Ambiguous Pages dispatch receipts; inspect without redispatching');
        insist(runs.length === 1, 'Pages dispatch outcome unknown; do not dispatch again automatically');
        p.deployment.runId = runs[0].id; p.deployment.phase = 'observing'; save();
        if (runs[0].status !== 'completed') return { waiting: true, ...p.deployment };
        insist(runs[0].conclusion !== 'success', 'Successful workflow lacks a verified Pages deployment receipt');
        insist(input.retryDeploy === true, 'Pages run failed; preserve pending and explicitly authorize one retry');
        insist((p.deployment.retryCount ?? 0) < 1, 'Pages retry already used; preserve the failure for manual inspection');
      }
      const retryCount = p.deployment ? (p.deployment.retryCount ?? 0) + 1 : 0;
      p.phase = 'deploying'; p.deployment = { phase: 'dispatching', sha: through, requestedAt: now(), runId: null, retryCount }; save();
      await api.dispatch(through);
      const runs = await api.publishRuns(through, p.deployment.requestedAt);
      insist(runs.length === 1, 'Pages dispatch receipt pending or ambiguous; recover without another dispatch');
      p.deployment = { ...p.deployment, phase: 'observing', runId: runs[0].id }; save();
      return { waiting: true, ...p.deployment };
    }
    insist(command === 'complete' && text(input.reason) && Array.isArray(input.evidence)
      && input.evidence.length > 0 && input.evidence.every(text), 'Completion requires a reason and evidence');
    if (state.reviewedThroughSha === null) insist(input.baselineSha === baselineSha, 'First review must acknowledge the public Pages baseline');
    let completed = null;
    if (p) {
      insist(p.number, 'Recover publishing before completion'); passReceipt(p);
      const pr = await api.pr(p.number); p.mergeSha = mergedPr(p, pr); p.phase = 'merged'; save();
      insist(await api.isAncestor(p.mergeSha, through) && await api.isAncestor(p.through, through), 'Pending merge/range is outside reviewed main');
      p.ci = await api.ci(p.headSha, needsPages(pr.files));
      let deployment = { required: false, reason: 'No deployed site or generated Skill source changes' };
      if (needsPages(pr.files)) {
        const receipt = await api.deployed(p.mergeSha, through);
        insist(receipt, 'Pages deployment/Actions receipt is not successful yet');
        const pages = await api.publicPages();
        deployment = { ...receipt, required: true, pages };
      }
      completed = { ...p, deployment };
    }
    insist(await api.main() === through, 'main moved during completion; do not advance the cursor');
    if (state.reviewedThroughSha !== through) state.reviews.push({ fromSha: from, reviewedThroughSha: through, checkedAtUtc: now(),
      result: completed ? 'documentation_completed' : 'no_documentation_update', reason: input.reason, evidence: input.evidence, pullRequest: completed });
    state.reviewedThroughSha = through; state.pending = null; state.lastFailure = null; save();
    atomic(files.cursor, through + '\n');
    return { reviewedThroughSha: through, cursorAdvanced: from !== through };
  } catch (error) {
    if (state) {
      state.lastFailure = { at: now(), command, reason: error.message };
      try { save(); } catch { /* Preserve the original error and any durable intent. */ }
    }
    throw error;
  } finally { rmSync(files.lock, { recursive: true }); }
}

function run(program, args, cwd) {
  return execFileSync(program, args, { cwd, encoding: 'utf8', timeout: 60000, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } }).trim();
}
export function github(root, invoke = run, fetchPage = fetch) {
  const gh = args => invoke('gh', args, root), json = args => JSON.parse(gh(args));
  const pages = endpoint => json(['api', '--paginate', '--slurp', endpoint]);
  const paged = endpoint => pages(endpoint).flat();
  const api = {
    main: () => json(['api', `repos/${repository}/commits/main`]).sha,
    isAncestor: (a, b) => { try { invoke('git', ['merge-base', '--is-ancestor', a, b], root); return true; } catch { return false; } },
    branch: head => {
      const commit = json(['api', `repos/${repository}/git/ref/heads/${head}`]).object.sha;
      const comparison = json(['api', `repos/${repository}/compare/main...${commit}`]);
      insist(Array.isArray(comparison.files) && comparison.files.length < 300, 'Branch comparison may be truncated');
      return { sha: commit, files: comparison.files.flatMap(f => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]) };
    },
    find: head => paged(`repos/${repository}/pulls?state=all&head=${encodeURIComponent('Wutpeach:' + head)}&base=main&per_page=100`)
      .map(p => ({ number: p.number, state: p.state === 'open' ? 'OPEN' : p.merged_at ? 'MERGED' : 'CLOSED', headRefOid: p.head.sha })),
    create: (head, title, body) => gh(['api', '-X', 'POST', `repos/${repository}/pulls`, '-f', `head=${head}`, '-f', 'base=main', '-f', `title=${title}`, '-f', `body=${body}`]),
    pr: number => {
      const p = json(['api', `repos/${repository}/pulls/${number}`]), files = paged(`repos/${repository}/pulls/${number}/files?per_page=100`);
      insist(files.length === p.changed_files, 'PR file list is incomplete');
      return { number, url: p.html_url, state: p.merged ? 'MERGED' : p.state.toUpperCase(), draft: p.draft,
        headRefOid: p.head.sha, headRefName: p.head.ref, baseRefName: p.base.ref, mergeCommit: { oid: p.merge_commit_sha },
        files: files.flatMap(f => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]) };
    },
    ci: (head, requireSite) => {
      const runs = pages(`repos/${repository}/actions/runs?head_sha=${head}&event=pull_request&per_page=100`).flatMap(p => p.workflow_runs);
      const required = ['.github/workflows/main.yml', '.github/workflows/docs-sync.yml', ...(requireSite ? ['.github/workflows/deploy-docs.yml'] : [])];
      return required.map(path => {
        const r = runs.filter(r => r.path === path && r.head_sha === head && r.head_branch.startsWith('docs/sync-')).sort((a, b) => b.id - a.id)[0];
        insist(r?.status === 'completed' && r.conclusion === 'success', `Required CI is missing, pending or failed: ${path}`);
        return { path, sha: head, runId: r.id, url: r.html_url };
      });
    },
    assertMergeable: number => {
      const query = 'query($owner:String!,$name:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){mergeable reviewDecision reviewThreads(first:100,after:$endCursor){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}';
      const responses = json(['api', 'graphql', '--paginate', '--slurp', '-f', `query=${query}`, '-f', 'owner=Wutpeach', '-f', 'name=Clackly', '-F', `number=${number}`]);
      for (const page of responses) {
        const p = page.data?.repository?.pullRequest;
        insist(p?.mergeable === 'MERGEABLE' && p.reviewDecision !== 'CHANGES_REQUESTED'
          && p.reviewThreads.nodes.every(t => t.isResolved), 'PR conflicts, requested changes or unresolved review threads');
      }
      insist(responses.length > 0, 'Missing mergeability evidence');
    },
    merge: (number, head) => gh(['pr', 'merge', String(number), '--repo', repository, '--merge', '--match-head-commit', head]),
    dispatch: expectedMain => {
      insist(api.main() === expectedMain, 'main moved before Pages dispatch');
      return gh(['workflow', 'run', 'deploy-docs.yml', '--repo', repository, '--ref', 'main', '-f', 'publish=true', '-f', `expected_sha=${expectedMain}`]);
    },
    publishRuns: (head, after) => pages(`repos/${repository}/actions/workflows/deploy-docs.yml/runs?head_sha=${head}&event=workflow_dispatch&per_page=100`)
      .flatMap(p => p.workflow_runs).filter(r => r.head_sha === head && r.created_at >= after.slice(0, 19) + 'Z'),
    deployed: async (mergeSha, through) => {
      const deployments = paged(`repos/${repository}/deployments?environment=github-pages&per_page=100`);
      for (const d of deployments) {
        if (d.ref !== 'main' || !sha(d.sha) || !await api.isAncestor(mergeSha, d.sha) || !await api.isAncestor(d.sha, through)) continue;
        const status = json(['api', `repos/${repository}/deployments/${d.id}/statuses?per_page=1`])[0];
        if (status?.state !== 'success' || status.environment_url?.replace(/\/$/, '') !== publicSite.replace(/\/$/, '')) continue;
        const match = status.log_url?.match(/^https:\/\/github\.com\/Wutpeach\/Clackly\/actions\/runs\/(\d+)(?:\/|$)/);
        if (!match) continue;
        const r = json(['api', `repos/${repository}/actions/runs/${match[1]}`]);
        if (r.head_sha !== d.sha || r.head_branch !== 'main' || r.event !== 'workflow_dispatch'
          || r.path !== '.github/workflows/deploy-docs.yml' || r.status !== 'completed' || r.conclusion !== 'success') continue;
        return { id: d.id, sha: d.sha, runId: r.id, runUrl: r.html_url, statusUrl: status.url, environmentUrl: status.environment_url };
      }
      return null;
    },
    publicPages: async () => {
      const receipts = [];
      for (const suffix of ['', 'en/', 'docs/', 'en/docs/']) {
        const url = publicSite + suffix, response = await fetchPage(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
        insist(response.ok && response.url === url, `Public page is unavailable: ${url}`);
        const html = await response.text();
        insist(/<title>[^<]*Clackly[^<]*<\/title>/i.test(html) && !/Page Not Found|<title>404/i.test(html), `Unexpected public page: ${url}`);
        receipts.push({ url, status: response.status, checkedAtUtc: now() });
      }
      return receipts;
    },
  };
  return api;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, inputFile] = process.argv.slice(2), root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const input = inputFile ? JSON.parse(readFileSync(inputFile, 'utf8')) : {};
    console.log(JSON.stringify(await synchronize(root, command, input, github(root)), null, 2));
  } catch (error) { console.error('Clackly Docs Sync failed:', error.message); process.exitCode = 1; }
}
