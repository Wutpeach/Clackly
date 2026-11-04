const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ExtensionManager } = require('./ExtensionManager');
const { workspace, manifest } = require('./fixtures');

test('process interruption before or after the atomic pointer preserves one usable version and its config', async (t) => {
  const { manager, pack, install } = workspace(t);
  await install(); manager.saveConfig('test.tools', { label: 'survives interruption' });
  const file = pack(manifest({ version: '2.0.0' }));
  const code = [
    "const fs = require('node:fs');",
    "const { ExtensionManager } = require(process.argv[1]);",
    "const manager = new ExtensionManager({root: process.argv[2]});",
    "const rename = fs.renameSync;",
    "fs.renameSync = function(from, to) { if(to === manager.statePath) {",
    "if(process.argv[4] === 'before') process.exit(73); rename(from, to); process.exit(74); } return rename(from, to); };",
    "manager.preview(process.argv[3]).then(p => manager.install(p.token, p.operation)).catch(e => { console.error(e); process.exitCode=1; });"
  ].join('\n');
  const modulePath = path.resolve(__dirname, 'ExtensionManager.js');
  for (const [stage, exitCode, version] of [['before', 73, '1.0.0'], ['after', 74, '2.0.0']]) {
    const result = spawnSync(process.execPath, ['-e', code, modulePath, manager.root, file, stage], { windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, exitCode, result.stderr);
    const recovered = new ExtensionManager({ root: manager.root, executePython: async (request) => ({ ok: true, result: request.config }) });
    assert.equal(recovered.list()[0].version, version);
    assert.equal((await recovered.execute(recovered.commands()[0])).result.label, 'survives interruption');
    // An interrupted writer intentionally leaves a lock; only this fixture knows its child exited.
    require('node:fs').unlinkSync(path.join(manager.root, 'state.lock'));
  }
});
