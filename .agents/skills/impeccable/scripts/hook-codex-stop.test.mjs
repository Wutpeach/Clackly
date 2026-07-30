import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { payload, resolveHarness, runStopHook } from './hook-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('clean Codex Stop emits valid continuation JSON', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-codex-stop-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const event = JSON.stringify({
    hook_event_name: 'Stop',
    session_id: 'clean-session',
    turn_id: 'turn-1',
    cwd,
  });
  const run = spawnSync(process.execPath, [path.join(here, 'hook.mjs')], {
    cwd,
    input: event,
    encoding: 'utf8',
  });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { continue: true });
});

test('Codex Stop findings request a continuation with the finding text', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-codex-finding-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const filePath = path.join(cwd, 'App.jsx');
  const sessionId = 'finding-session';
  fs.writeFileSync(filePath, '<main>UI</main>');
  fs.mkdirSync(path.join(cwd, '.impeccable'));
  fs.writeFileSync(path.join(cwd, '.impeccable', 'hook.cache.json'), JSON.stringify({
    version: 1,
    sessions: {
      [sessionId]: {
        updatedAt: Date.now(),
        files: { [filePath]: { editCount: 1, findings: [] } },
      },
    },
  }));

  const result = await runStopHook({
    cwd,
    stdinJson: {
      hook_event_name: 'Stop',
      session_id: sessionId,
      turn_id: 'turn-2',
      cwd,
    },
    detector: {
      detectText: async () => [{
        antipattern: 'test-finding',
        line: 1,
        name: 'Test finding',
        description: 'Fix the visual issue.',
      }],
    },
  });
  const output = JSON.parse(result.stdout);

  assert.equal(output.decision, 'block');
  assert.match(output.reason, /\[test-finding\]/);
});

test('non-Stop and non-Codex payload contracts stay unchanged', () => {
  assert.equal(resolveHarness({ IMPECCABLE_HOOK_HARNESS: 'codex' }), 'codex');
  assert.deepEqual(JSON.parse(payload('check', 'PostToolUse', 'codex')), {
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'check' },
  });
  assert.deepEqual(JSON.parse(payload('check', 'Stop', 'claude')), {
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: 'check' },
  });
  assert.deepEqual(JSON.parse(payload('check', 'PostToolUse', 'cursor')), { additional_context: 'check' });
  assert.deepEqual(JSON.parse(payload('check', 'PostToolUse', 'github')), { additionalContext: 'check' });
});
