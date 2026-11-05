const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { readPackage } = require('../extensions/package');
const { ExtensionManager } = require('../extensions/ExtensionManager');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('../extensions/python');

const skill = path.resolve(__dirname, '../../skills/clackly-developer');
const packer = path.join(skill, 'scripts/package_extension.py');
const python = process.env.PYTHON || 'python';
const app = path.resolve(__dirname, '..');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-skill-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.cpSync(path.join(skill, 'examples/inspect-project'), source, { recursive: true });
  const manifestPath = path.join(source, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const writeManifest = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  let sequence = 0;
  const pack = () => {
    const output = path.join(root, 'tool-' + sequence++ + '.clackly');
    execFileSync(python, [packer, source, output], { windowsHide: true });
    return output;
  };
  return { root, source, manifest, writeManifest, pack };
}

test('the standalone example is accepted by the real installer and executes in the real Runner with a fake Resolve adapter', async (t) => {
  const { root, manifest, pack } = workspace(t);
  const manager = new ExtensionManager({ root: path.join(root, 'managed'), executePython: async (request) => {
    // Real Runner, fake Resolve adapter: no native bridge, probe or live project access.
    const code = [
      'import json, sys',
      'from types import SimpleNamespace',
      'sys.path.insert(0, sys.argv[1])',
      'from python_runner import run_script',
      'resolve = SimpleNamespace(GetVersionString=lambda: "offline-fixture", GetProjectManager=lambda: SimpleNamespace(GetCurrentProject=lambda: None))',
      'adapter = SimpleNamespace(get_resolve=lambda: resolve)',
      'print(json.dumps(run_script(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]), adapter=adapter)))'
    ].join('\n');
    return JSON.parse(execFileSync(python, ['-B', '-c', code, path.join(app, 'script-runtime'),
      path.join(request.root, request.entry), request.commandId, JSON.stringify(request.config)], { encoding: 'utf8', windowsHide: true }));
  } });
  const output = pack();
  assert.equal((await readPackage(output)).manifest.id, 'example.inspect-project');
  const preview = await manager.preview(output);
  assert.equal(preview.operation, 'install');
  await manager.install(preview.token, preview.operation);
  manager.saveConfig(manifest.id, { label: 'offline' });
  const result = await manager.execute(manager.commands()[0]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { version: 'offline-fixture', hasProject: false });
  assert.match(result.logs[0].message, /offline/);
});

test('configured example, async command and resources run in a real worker; Replace preserves settings and IDs after restart', async (t) => {
  const { root, source, manifest, writeManifest, pack } = workspace(t);
  manifest.commands.push({ id: 'report', name: '报告配置', entry: 'report.py' });
  writeManifest();
  fs.mkdirSync(path.join(source, 'resources'));
  fs.writeFileSync(path.join(source, 'resources/message.txt'), 'resource-v1');
  fs.writeFileSync(path.join(source, 'report.py'), [
    'from pathlib import Path',
    'async def execute(context):',
    '    return {"label": context.config["label"], "command": context.command_id,',
    '            "resource": (Path(__file__).parent / "resources/message.txt").read_text(encoding="utf-8")} '
  ].join('\n'));
  const executable = execFileSync(python, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const executePython = createExtensionPythonExecutor({
    resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
      selectedBootstrap: path.join(app, 'script-runtime/runtime/bootstrap.py'), readiness: {} }),
    launcher: new RuntimeLauncher()
  });
  const managed = path.join(root, 'managed');
  let manager = new ExtensionManager({ root: managed, executePython });
  let preview = await manager.preview(pack());
  await manager.install(preview.token, preview.operation);
  assert.equal(manager.list()[0].status, 'needs-setup');
  const command = manager.commands().find((item) => item.id.endsWith('/report'));
  await assert.rejects(manager.execute(command), { code: 'EXTENSION_NEEDS_SETUP' });
  manager.saveConfig(manifest.id, { label: '保留配置' });
  assert.deepEqual((await manager.execute(command)).result,
    { label: '保留配置', command: command.id, resource: 'resource-v1' });
  manifest.name = '改名后工具';
  writeManifest();
  fs.writeFileSync(path.join(source, 'resources/message.txt'), 'resource-v2');
  preview = await manager.preview(pack());
  assert.equal(preview.operation, 'replace');
  await manager.install(preview.token, preview.operation);
  manager = new ExtensionManager({ root: managed, executePython });
  assert.deepEqual(manager.list()[0].values, { label: '保留配置' });
  assert.equal(manager.commands().find((item) => item.id === command.id).name, '报告配置');
  assert.deepEqual((await manager.execute(command)).result,
    { label: '保留配置', command: command.id, resource: 'resource-v2' });
});

test('packer rejects missing/exact-case entries, syntax errors, missing execute and duplicate IDs without executing code', (t) => {
  const { root, source, manifest, writeManifest, pack } = workspace(t);
  const marker = path.join(root, 'must-not-exist');
  const script = path.join(source, 'inspect.py');
  fs.writeFileSync(script, 'from pathlib import Path\nPath(' + JSON.stringify(marker.split(path.sep).join('/')) + ').touch()\ndef execute(context):\n    return None\n');
  pack();
  assert.equal(fs.existsSync(marker), false);
  const reject = (expected) => {
    const result = spawnSync(python, [packer, source, path.join(root, 'rejected.clackly')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
    assert.equal(fs.existsSync(path.join(root, 'rejected.clackly')), false);
  };
  manifest.commands[0].entry = 'INSPECT.py'; writeManifest(); reject(/exact Python entry/);
  manifest.commands[0].entry = '../inspect.py'; writeManifest(); reject(/exact Python entry/);
  manifest.commands[0].entry = 'inspect.py'; writeManifest();
  fs.writeFileSync(script, 'def execute(:'); reject(/invalid syntax/);
  fs.writeFileSync(script, 'value = 1'); reject(/top-level execute/);
  fs.writeFileSync(script, 'def execute(context):\n    return None\n');
  manifest.commands.push({ ...manifest.commands[0] }); writeManifest(); reject(/Duplicate Command id/);
});

test('packer includes resources, excludes local clutter, rejects output inside source and never overwrites an artifact', async (t) => {
  const { source, pack } = workspace(t);
  fs.writeFileSync(path.join(source, '.env'), 'secret');
  fs.mkdirSync(path.join(source, '__pycache__'));
  fs.writeFileSync(path.join(source, '__pycache__/cache.pyc'), 'cache');
  fs.writeFileSync(path.join(source, 'old.clackly'), 'old');
  fs.writeFileSync(path.join(source, 'resource.txt'), 'include me');
  const output = pack();
  assert.deepEqual([...((await readPackage(output)).files.keys())].sort(), ['inspect.py', 'manifest.json', 'resource.txt']);
  const before = fs.readFileSync(output);
  for (const target of [output, path.join(source, 'inside.clackly')]) {
    const result = spawnSync(python, [packer, source, target], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
  }
  assert.deepEqual(fs.readFileSync(output), before);
  assert.equal(fs.existsSync(path.join(source, 'inside.clackly')), false);
});

test('packer rejects directory links instead of archiving files from outside the source', (t) => {
  const { root, source } = workspace(t);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.txt'), 'not a package resource');
  const link = path.join(source, 'linked');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const output = path.join(root, 'rejected.clackly');
  try {
    const result = spawnSync(python, [packer, source, output], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Links are not package files/);
    assert.equal(fs.existsSync(output), false);
  } finally { fs.unlinkSync(link); }
});
