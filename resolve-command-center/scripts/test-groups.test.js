const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverNodeSuites, nodePartitions, testGroups, PYTHON_SUITES } = require('./test-groups');

test('Node groups cover every source suite exactly once, including explicit integrations', () => {
  const groups = nodePartitions();
  const combined = [...groups.node, ...groups.integration];
  assert.equal(new Set(combined).size, combined.length);
  assert.deepEqual(combined.sort(), discoverNodeSuites());
  assert.ok(groups.node.includes('script-runtime/runtime-launcher.test.js'));
  for (const suite of ['script-runtime/runtime-launcher.integration.js',
    'electron/main/update/windows.integration.js', 'scripts/test-groups.integration.js',
    'scripts/install-workflow-plugin.test.js', 'scripts/internal-beta.test.js',
    'scripts/stage-managed-python.test.js', 'scripts/workflow-release/package.test.js']) {
    assert.ok(groups.integration.includes(suite), 'Missing serial coverage: ' + suite);
  }
  for (const suite of ['config/ConfigStorage.test.js', 'electron/main/update/identity.test.js',
    'electron/main/update/zip.test.js', 'electron/main/update/UpdateService.test.js',
    'electron/main/update/install/WorkflowInstaller.test.js']) {
    assert.ok(groups.node.includes(suite), 'Missing logic coverage: ' + suite);
  }
});

test('individual group commands cover the same Node partition and all five Python roots', () => {
  const groups = testGroups();
  const partitions = nodePartitions();
  assert.deepEqual(groups.node[0].args, ['--test', ...partitions.node]);
  assert.deepEqual(groups.integration[0].args, ['--test', '--test-concurrency=1', ...partitions.integration]);
  assert.deepEqual(PYTHON_SUITES, ['bridge', 'resolve', 'script-runtime', 'resolve2ae_core/tests', 'scripts']);
  assert.deepEqual(groups.python.map((step) => step.args), PYTHON_SUITES.map((directory) =>
    ['-m', 'unittest', 'discover', '-s', directory, '-p', 'test_*.py']));
});

test('isolated UI and system lanes cover all integration suites exactly once and remain serial', () => {
  const all = testGroups().integration[0].args.slice(2);
  const ui = testGroups(undefined, 'ui').integration[0].args;
  const system = testGroups(undefined, 'system').integration[0].args;
  assert.deepEqual(ui.slice(0, 2), ['--test', '--test-concurrency=1']);
  assert.deepEqual(system.slice(0, 2), ['--test', '--test-concurrency=1']);
  const combined = [...ui.slice(2), ...system.slice(2)];
  assert.equal(new Set(combined).size, combined.length);
  assert.deepEqual(combined.sort(), all);
  assert.ok(ui.includes('command-search/launcher.integration.js'));
  assert.ok(ui.includes('extensions/ui.integration.js'));
  assert.ok(system.includes('script-runtime/runtime-launcher.integration.js'));
  assert.ok(system.includes('electron/main/update/windows.integration.js'));
  assert.ok(system.includes('scripts/workflow-release/package.test.js'));
  assert.throws(() => testGroups(undefined, 'typo'), /Unknown or empty integration suite/);
});
