// Explicit read-only development smoke. Never installed or run by the application.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createClacklyCore } = require('../app/createClacklyCore');
const { RuntimeResolver } = require('../script-runtime/runtime/resolver');
const { loadRuntimeRegistry } = require('../script-runtime/runtime/loader');
const { zipBuffer } = require('../electron/main/update/fixtures');

async function main() {
  if (process.argv[2] !== '--read-only' || !path.isAbsolute(process.argv[3] || '')) throw new Error('Usage: node scripts/extension-v1-resolve-smoke.js --read-only <absolute staged runtime root>');
  const appRoot = path.resolve(__dirname, '..');
  const evidence = path.join(appRoot, 'build/extension-v1-evidence'); fs.mkdirSync(evidence, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-extension-resolve-'));
  let core;
  try {
    core = createClacklyCore({ appRoot, appDataPath: path.join(temporary, 'appdata'), temporaryRoot: temporary,
      resolveInstallationHost: { kind: 'standalone', execPath: process.execPath },
      hostContextProvider: async () => {
        const snapshot = await core.installationPaths.getSnapshot();
        const literal = snapshot.resolveExecutable.replaceAll("'", "''");
        const version = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          "(Get-Item -LiteralPath '" + literal + "').VersionInfo.ProductVersion"], { windowsHide: true, encoding: 'utf8' }).trim();
        return { application: 'davinci-resolve', version };
      },
      markerBackends: {},
      imageClipboard: { clipboard: { readPng: async () => null }, picturesPath: temporary,
        resolveMediaPool: { isAvailable: async () => false, getCurrentProjectName: async () => null, importMediaToBin: async () => { throw new Error('Read-only smoke'); } } }
    });
    const runtimeRoot = path.resolve(process.argv[3]);
    core.runtimeManager.resolver = new RuntimeResolver({ registry: loadRuntimeRegistry({ runtimeRoot }) });
    const example = path.join(appRoot, 'examples/extensions/inspect-project');
    const manifest = JSON.parse(fs.readFileSync(path.join(example, 'manifest.json'), 'utf8'));
    const script = fs.readFileSync(path.join(example, 'inspect.py'), 'utf8');
    const file = path.join(evidence, 'ProjectInspector.clackly');
    const write = (value) => fs.writeFileSync(file, zipBuffer([['manifest.json', JSON.stringify(value)], ['inspect.py', script]]));
    write(manifest);
    let preview = await core.extensions.preview(file); await core.extensions.install(preview.token, preview.operation);
    assert.equal(core.extensions.list()[0].status, 'needs-setup');
    core.extensions.saveConfig(manifest.id, { label: 'Read-only V1 smoke' });
    const command = core.searchCommands('Inspect Resolve Project', []).commands[0];
    assert.ok(command);
    const first = await core.executeSearchResult(command.id);
    assert.equal(first.ok, true); assert.match(first.result.version, /^21[.]1[.]0/);
    const receipts = [{ operation: 'install/search/execute', result: first.result }];
    for (const [version, operation] of [['1.0.0', 'replace'], ['1.1.0', 'update'], ['0.9.0', 'downgrade']]) {
      write({ ...manifest, version, name: 'Renamed Inspector ' + version });
      preview = await core.extensions.preview(file); assert.equal(preview.operation, operation);
      await core.extensions.install(preview.token, operation);
      assert.equal(core.searchCommands('Inspect Resolve Project', []).commands[0].id, command.id);
      assert.equal(core.extensions.list()[0].values.label, 'Read-only V1 smoke');
      const result = await core.executeSearchResult(command.id); assert.equal(result.ok, true);
      receipts.push({ operation, version, result: result.result });
    }
    await core.extensions.setEnabled(manifest.id, false);
    await assert.rejects(core.executeSearchResult(command.id), { code: 'EXTENSION_DISABLED' });
    await core.extensions.setEnabled(manifest.id, true);
    await core.extensions.uninstall(manifest.id, false);
    assert.equal(core.searchCommands('Inspect Resolve Project', []).commands.length, 0);
    await assert.rejects(core.executeSearchResult(command.id), /Unknown command/);
    const ordinary = await core.ordinaryScripts.discover();
    write(manifest); // Leave a portable example, not an installed extension.
    const report = { date: new Date().toISOString(), host: 'Running Resolve via real external Scripting API; not Workflow UI acceptance',
      runtimeRoot, installedVersionUnchanged: true, isolatedData: true, projectWrites: false,
      receipts, disabledBlocked: true, uninstallRemovedCommands: true, ordinaryScriptCount: ordinary.scripts?.length || 0,
      builtInCommands: core.listCommands().map((command) => command.id) };
    fs.writeFileSync(path.join(evidence, 'resolve-readonly-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    core?.disposeExportPythonWorker(); core?.disposeAfterEffectsProcessProbe();
    if (path.dirname(temporary) !== fs.realpathSync(os.tmpdir())) throw new Error('Unexpected temporary directory');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
