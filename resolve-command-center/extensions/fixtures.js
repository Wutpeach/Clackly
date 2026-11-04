const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zipBuffer } = require('../electron/main/update/fixtures');
const { ExtensionManager } = require('./ExtensionManager');
function manifest(patch = {}) {
  return { schemaVersion: 1, id: 'test.tools', name: 'Test Tools', version: '1.0.0', description: 'Extension test package',
    source: 'Local test fixture', commands: [{ id: 'inspect', name: 'Inspect project', entry: 'inspect.py', keywords: ['inspection'] }],
    configSchema: { label: { type: 'string', label: 'Label', required: true } }, ...patch };
}
function workspace(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-extensions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manager = new ExtensionManager({ root: path.join(directory, 'extensions'), executePython: async (request) => ({ ok: true, result: request.config }), ...options });
  const pack = (value = manifest(), additions = [], script = 'def execute(context):\n    return {"label": context.config.get("label"), "command": context.command_id}\n') => {
    const file = path.join(directory, 'test.clackly');
    fs.writeFileSync(file, zipBuffer([['manifest.json', JSON.stringify(value)], ['inspect.py', script], ...additions]));
    return file;
  };
  const install = async (value = manifest(), additions = []) => {
    const preview = await manager.preview(pack(value, additions));
    await manager.install(preview.token, preview.operation);
    return preview;
  };
  return { directory, manager, pack, install };
}
module.exports = { manifest, workspace };
