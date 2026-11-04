const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('./python');
const { workspace, manifest } = require('./fixtures');

test('a real isolated Python worker executes an installed package with filtered config and reports script failure', async (t) => {
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const { manager, pack } = workspace(t);
  manager.executePython = createExtensionPythonExecutor({
    resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
      selectedBootstrap: path.resolve(__dirname, '../script-runtime/runtime/bootstrap.py'), readiness: {} }),
    launcher: new RuntimeLauncher()
  });
  let preview = await manager.preview(pack()); await manager.install(preview.token, preview.operation);
  manager.saveConfig('test.tools', { label: '真实 Python' });
  const result = await manager.execute(manager.commands()[0]);
  assert.deepEqual(result.result, { label: '真实 Python', command: 'extension:test.tools/inspect' });
  preview = await manager.preview(pack(manifest(), [], 'def execute(context):\n    raise ValueError("fixture failure")\n'));
  await manager.install(preview.token, preview.operation);
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_SCRIPT_FAILED' });
});
