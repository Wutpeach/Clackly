const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const scriptPath = path.join(__dirname, 'install-workflow-plugin.ps1');
function invoke(args) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', scriptPath, ...args], { encoding: 'utf8' });
}

test('production first-install rejects extracted PackageRoot without changing the target', { skip: process.platform !== 'win32' }, (t) => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clackly-first-install-boundary-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const sentinel=path.join(root,'keep.txt'); fs.writeFileSync(sentinel,'unchanged');
  for (const mode of ['Junction','Copy']) {
    const result=invoke(['-PackageRoot',root,'-PluginRoot',root,'-Mode',mode]);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/original official Release ZIP/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');
    assert.deepEqual(fs.readdirSync(root),['keep.txt']);
  }
});

test('production Archive cannot choose a target, native source, host or bypass', { skip: process.platform !== 'win32' }, () => {
  const archive=path.join(os.tmpdir(),'CLACKLY-INTENTIONALLY-ABSENT.zip');
  for (const extra of [['-Mode','Copy'],['-PluginRoot',os.tmpdir()]]) {
    const result=invoke(['-Archive',archive,...extra]);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/fixed production target/);
  }
  for (const value of ['', '   ']) {
    const result=invoke(['-Archive',value,'-PluginRoot',os.tmpdir()]);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Archive must identify|Missing an argument|缺少参数/is);
  }
  for (const extra of ['-WorkflowNodeSource','-WorkflowExecutable','-SkipSignature']) {
    const result=invoke(['-Archive',archive,extra,'untrusted']);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/parameter.*cannot be found|找不到.*参数/is);
  }
});

test('local native fixtures remain SDK-free and never gain production qualification', { skip: process.platform !== 'win32' }, () => {
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'workflow-update','LocalNative.test.ps1')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr || result.stdout);
  assert.match(result.stdout,/PASS inert-fixture-never-production-qualified/);
  assert.match(result.stdout,/PASS independent-programdata-E-host/);
});
