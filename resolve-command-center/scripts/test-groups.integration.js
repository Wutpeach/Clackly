const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSteps } = require('./test-groups');

test('a failed child does not starve later groups and leaves an unsuccessful aggregate', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-test-groups-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const summary = [];
  const result = runSteps([
    { label: 'failed', command: process.execPath, args: ['-e', 'process.exitCode = 7'] },
    { label: 'later', command: process.execPath, args: ['-e',
      "require('node:fs').writeFileSync('later.txt', 'completed')"] }
  ], { cwd: root, report: (line) => summary.push(line) });
  assert.equal(fs.readFileSync(path.join(root, 'later.txt'), 'utf8'), 'completed');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.outcomes.map(({ status, passed }) => ({ status, passed })),
    [{ status: 7, passed: false }, { status: 0, passed: true }]);
  assert.ok(summary.at(-1).includes('Test group summary:'));
  assert.ok(summary.at(-1).includes('"status":7'));
});

test('an unavailable interpreter is reported as failure while later groups still run', () => {
  const result = runSteps([
    { label: 'unavailable', command: path.join(os.tmpdir(), 'clackly-nonexistent-test-interpreter'), args: [] },
    { label: 'later', command: process.execPath, args: ['-e', 'process.exitCode = 0'] }
  ], { report: () => {} });
  assert.equal(result.exitCode, 1);
  assert.equal(result.outcomes[0].passed, false);
  assert.equal(result.outcomes[0].error.code, 'ENOENT');
  assert.equal(result.outcomes[1].passed, true);
});
