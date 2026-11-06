const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { workspace, manifest } = require('./fixtures');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('./python');
const ui = { version: 2, prepare: true, inputs: { target: { type: 'select', dynamic: true, label: 'Target', required: true } } };

test('real short-lived Python Prepare/Execute callbacks, independent timeout and malformed return fail closed', { timeout: 40000 }, async (t) => {
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const executor = createExtensionPythonExecutor({ resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
    selectedBootstrap: path.resolve(__dirname, '../script-runtime/runtime/bootstrap.py'), readiness: {} }), launcher: new RuntimeLauncher() });
  const f = workspace(t, { executePython: executor });
  const value = manifest({ configSchema: { mode: { type: 'string', label: 'Mode' } } }); value.commands[0].ui = ui;
  const script = [
    'import os, time',
    'def prepare(context):',
    '    assert context.phase == "prepare" and context.input == {}',
    '    mode = context.config.get("mode", "ready")',
    '    if mode == "timeout": time.sleep(12)',
    '    if mode == "failed": raise ValueError("Preparation rejected")',
    '    if mode == "malformed": return {"$clackly": "prepare", "version": 1, "options": {"unknown": []}}',
    '    return {"$clackly": "prepare", "version": 1, "options": {"target": [{"label": str(os.getpid()), "value": "a"}]}, "defaults": {"target": "a"}}',
    'def execute(context):',
    '    assert context.phase == "execute" and context.input["target"] == "a"',
    '    return {"pid": os.getpid(), "target": context.input["target"]}'
  ].join('\n');
  const install = await f.manager.preview(f.pack(value, [], script)); await f.manager.install(install.token, install.operation);
  const command = f.manager.commands()[0], revision = f.manager.describeCommand(command.id).revision;
  const prepared = await f.manager.prepare(command.id, revision);
  const receipt = await f.manager.execute(command, { revision, prepareToken: prepared.token, input: { target: 'a' } });
  assert.equal(receipt.result.target, 'a');
  assert.notEqual(String(receipt.result.pid), prepared.ui.inputs.target.options[0].label);
  for (const [mode, pattern] of [['failed', /Preparation rejected/], ['malformed', /未声明/], ['timeout', /RUNTIME_TIMEOUT/]]) {
    f.manager.saveConfig(value.id, { mode });
    await assert.rejects(f.manager.prepare(command.id, revision), pattern);
  }
  f.manager.saveConfig(value.id, { mode: 'ready' });
  assert.ok((await f.manager.prepare(command.id, revision)).token);
});
