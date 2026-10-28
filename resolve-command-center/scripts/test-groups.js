const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const APP_ROOT = path.resolve(__dirname, '..');
const GENERATED_DIRECTORIES = new Set(['node_modules', 'build', 'dist', 'release', 'resources']);
// Whole mixed suites stay together: their real children must not contend with
// ordinary logic tests. Explicit *.integration.js files also belong to this lane.
const SUBPROCESS_SUITES = [
  'script-runtime/host-bridge-integration.test.js',
  'script-runtime/integration.test.js',
  'script-runtime/persistent.test.js',
  'script-runtime/runtime-probe.test.js',
  'scripts/diagnostic-sampler.test.js',
  'scripts/install-workflow-plugin.test.js',
  'scripts/internal-beta.test.js',
  'scripts/stage-managed-python.test.js',
  'scripts/viteDevRenderer.test.js',
  'scripts/workflow-release/package.test.js'
];
const PYTHON_SUITES = ['bridge', 'resolve', 'script-runtime', 'resolve2ae_core/tests', 'scripts'];

function discoverNodeSuites(root = APP_ROOT, directory = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && !GENERATED_DIRECTORIES.has(entry.name)) {
      files.push(...discoverNodeSuites(root, relative));
    } else if (entry.isFile() && /\.(?:test\.(?:js|mjs)|integration\.js)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files.sort();
}

function nodePartitions(root = APP_ROOT) {
  const suites = discoverNodeSuites(root);
  for (const file of SUBPROCESS_SUITES) {
    if (!suites.includes(file)) throw new Error('Missing subprocess suite: ' + file);
  }
  const integration = suites.filter((file) => SUBPROCESS_SUITES.includes(file) || file.endsWith('.integration.js'));
  const node = suites.filter((file) => !integration.includes(file));
  if (!node.length || !integration.length) throw new Error('A Node test group is empty');
  return { node, integration };
}

function testGroups(root = APP_ROOT) {
  const partitions = nodePartitions(root);
  return {
    node: [{ label: 'Node logic', command: process.execPath, args: ['--test', ...partitions.node] }],
    integration: [{ label: 'Serial subprocess / Windows integration', command: process.execPath,
      args: ['--test', '--test-concurrency=1', ...partitions.integration] }],
    python: PYTHON_SUITES.map((directory) => ({ label: 'Python ' + directory, command: 'python',
      args: ['-m', 'unittest', 'discover', '-s', directory, '-p', 'test_*.py'] }))
  };
}

// Run serially to avoid real-worker contention, but never let one failed group
// prevent a later independent group (or Python directory) from being attempted.
function runSteps(steps, { cwd = APP_ROOT, report = console.log } = {}) {
  const outcomes = [];
  for (const step of steps) {
    report('\nRunning ' + step.label + ': ' + JSON.stringify([step.command, ...step.args]));
    let result;
    try {
      result = spawnSync(step.command, step.args, { cwd, stdio: 'inherit', shell: false, windowsHide: true });
    } catch (error) { result = { status: null, error }; }
    const outcome = { label: step.label, status: result.status, signal: result.signal || null,
      error: result.error ? { code: result.error.code || null, message: result.error.message } : null,
      passed: result.status === 0 && !result.error && !result.signal };
    outcomes.push(outcome);
    report(JSON.stringify(outcome));
  }
  const exitCode = outcomes.every((outcome) => outcome.passed) ? 0 : 1;
  report('\nTest group summary: ' + JSON.stringify({ exitCode, outcomes }));
  return { exitCode, outcomes };
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['all', 'node', 'integration', 'python', '--list'].includes(args[0])) {
    throw new Error('Usage: node scripts/test-groups.js <all|node|integration|python|--list>');
  }
  const groups = testGroups();
  if (args[0] === '--list') { console.log(JSON.stringify(groups, null, 2)); return 0; }
  return runSteps(args[0] === 'all' ? Object.values(groups).flat() : groups[args[0]]).exitCode;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { discoverNodeSuites, nodePartitions, testGroups, runSteps, SUBPROCESS_SUITES, PYTHON_SUITES };
