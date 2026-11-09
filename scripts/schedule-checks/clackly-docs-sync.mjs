import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProgress, repository } from '../docs-sync.mjs';

export function remoteMain() {
  const output = execFileSync('git', ['ls-remote', '--exit-code', `https://github.com/${repository}.git`, 'refs/heads/main'], {
    encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  const match = output.trim().match(/^([a-f0-9]{40})\s+refs\/heads\/main$/);
  if (!match) throw new Error('Cannot determine remote Clackly main SHA');
  return match[1];
}

export function check(root, query = remoteMain) {
  const progress = readProgress(root);
  if (progress.lockExists) throw new Error('Docs Sync lock exists; inspect its owner without deleting it automatically');
  // Recovery cannot depend on a new commit or on GitHub being reachable.
  if (progress.state.pending || progress.state.lastFailure || progress.cursorRepairNeeded) return 0;
  const head = query();
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid remote main SHA');
  return progress.cursor !== null && progress.cursor === head ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const decision = check(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
    console.log('CINDY_PRECHECK_OK');
    process.exitCode = decision;
  } catch (error) { console.error('Clackly 文档审查前置检查失败:', error.message); process.exitCode = 1; }
}
