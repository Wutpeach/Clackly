// Copies the fixed launcher into marked isolated roots; all other code is inert.
// No installed entrypoint, vendor/native/network or real inbox access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { observeLauncher, spawnLauncher } = require('./WorkflowInstaller');
const id = 'a'.repeat(32);
const scripts = path.resolve(__dirname, '../../../../scripts/workflow-update');
const powershell = path.join(process.env.SystemRoot || 'C:\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const evidence = path.resolve(__dirname, '../../../../build/test-evidence/handoff');
const ps = (value) => "'" + value.replaceAll("'", "''") + "'";
function fixture(mode = 'ready', original = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Clackly-R20-inert-'));
  const request = path.join(root, 'request'); fs.mkdirSync(request);
  fs.writeFileSync(path.join(root, 'INERT-FIXTURE'), 'No live operations');
  fs.writeFileSync(path.join(request, 'request.json'), JSON.stringify({ id }));
  let source = fs.readFileSync(path.join(scripts, 'launch.ps1'), 'utf8');
  if (original) {
    const prior = spawnSync('git', ['show', 'HEAD:resolve-command-center/scripts/workflow-update/launch.ps1'], { encoding: 'utf8', windowsHide: true });
    assert.equal(prior.status, 0); source = prior.stdout;
  }
  fs.writeFileSync(path.join(root, 'launch.ps1'), source);
  fs.writeFileSync(path.join(root, 'WorkflowTransaction.psm1'), mode === 'import-failure' ? "throw 'inert-import-failure'" :
    'function Read-UpdateJson($file,$limit) { [IO.File]::ReadAllText($file) | ConvertFrom-Json }; Export-ModuleMember -Function Read-UpdateJson');
  fs.writeFileSync(path.join(root, 'ExecutorSupport.psm1'), [
    'function Get-ExecutorLocations($id) {',
    'if (!(Test-Path -LiteralPath ' + ps(path.join(root, 'INERT-FIXTURE')) + ")) { throw 'not-fixture' }",
    mode === 'locations-failure' ? "throw 'inert-locations-failure'" : '',
    'return @{Request=' + ps(request) + '}}',
    'function Assert-InstalledExecutor($scripts,$locations) {}',
    'function Get-UpdateRequestKey($request) { ' + (mode === 'key-failure' ? "throw 'inert-key-failure'" : "return 'inert-fixture-key'") + ' }',
    'function Write-ExecutorJson($file,$value) { [IO.File]::WriteAllText($file,($value | ConvertTo-Json -Compress)) }',
    'Export-ModuleMember -Function Get-ExecutorLocations,Assert-InstalledExecutor,Get-UpdateRequestKey,Write-ExecutorJson'
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'executor.ps1'), [
    'param([string]$RequestId,[string]$CandidateKey)', "$ErrorActionPreference='Stop'",
    mode === 'worker-failure' ? 'exit 17' : '',
    '$process=[Diagnostics.Process]::GetCurrentProcess()',
    mode === 'silent' ? '' : "[Console]::Out.WriteLine((@{id=$RequestId;event='ready';pid=$PID;created=$process.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress)); [Console]::Out.Flush()",
    '[IO.File]::WriteAllText(' + ps(path.join(root, 'worker-started.json')) + ",(@{pid=$PID} | ConvertTo-Json -Compress))",
    '$deadline=[DateTime]::UtcNow.AddSeconds(15)',
    'while (!(Test-Path -LiteralPath ' + ps(path.join(root, 'release-worker')) + ') -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }',
    '[IO.File]::WriteAllText(' + ps(path.join(root, 'worker-finished')) + ",'inert completion')"
  ].join('\n'));
  return { root, request, args: ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'launch.ps1'), '-RequestId', id] };
}
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'bounded inert fixture wait'); await new Promise((resolve) => setTimeout(resolve, 50)); }
}

test('worker readiness follows canonical host observation and cannot bypass unknown host or cancellation', { skip: process.platform !== 'win32' }, () => {
  const f = fixture(); const script = path.join(f.root, 'host-readiness.ps1');
  fs.writeFileSync(script, [
    "$ErrorActionPreference='Stop'",
    'Import-Module ' + ps(path.join(scripts, 'ExecutorSupport.psm1')) + ' -Force -DisableNameChecking',
    '$script:ready=0; $context=@{}',
    "if (!(Wait-UpdateHostExit $context -Cancelled {$false} -Observe {'closed'} -Ready {$script:ready++}) -or $script:ready -ne 1) {throw 'closed readiness'}",
    "$script:ready=0; if (Wait-UpdateHostExit $context -Cancelled {$true} -Observe {throw 'must not observe'} -Ready {$script:ready++}) {throw 'cancel'}; if ($script:ready -ne 0) {throw 'premature cancel readiness'}",
    "try { Wait-UpdateHostExit $context -Cancelled {$false} -Observe {'process-unknown'} -Ready {$script:ready++}; throw 'unknown accepted' } catch {if ($_.Exception.Message -ne 'process-unknown') {throw}}",
    "if ($script:ready -ne 0) {throw 'unknown readiness'}",
    "$script:ready=0; if (Wait-UpdateHostExit $context -Cancelled {$script:ready -gt 0} -Observe {'host-running'} -Ready {$script:ready++}) {throw 'cancel after readiness'}; if ($script:ready -ne 1) {throw 'running readiness'}",
    "'PASS canonical-host-before-readiness/cancel/unknown'"
  ].join('\n'));
  const result = spawnSync(powershell, ['-NoProfile','-NonInteractive','-File',script], {encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/PASS canonical-host/);
});

test('original pre-marker failures retain isolated first errors and never acknowledge', { skip: process.platform !== 'win32' }, () => {
  fs.mkdirSync(evidence, { recursive: true }); const records = [];
  for (const mode of ['import-failure', 'locations-failure', 'key-failure']) {
    const f = fixture(mode, true);
    const result = spawnSync(powershell, f.args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    const record = { mode, status: result.status, error: result.error?.code || null, stdout: result.stdout, stderr: result.stderr,
      launcher: fs.existsSync(path.join(f.request, 'launcher.json')), stopped: fs.existsSync(path.join(f.request, 'stopped.json')) };
    records.push(record);
    assert.equal(result.error, undefined); assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp('inert-' + mode));
    assert.equal(record.launcher, false); assert.equal(record.stopped, false);
  }
  fs.writeFileSync(path.join(evidence, 'original-first-failure-fixtures.json'), JSON.stringify(records, null, 2));
});

test('real PowerShell and Node spawn failures never publish an exit prompt', { skip: process.platform !== 'win32' }, async () => {
  for (const mode of ['import-failure', 'locations-failure', 'key-failure', 'worker-failure']) {
    const f = fixture(mode); const states = [];
    // Non-detached only inside this inert failure fixture, so PowerShell runs
    // even on hosts that reject DETACHED_PROCESS before reaching -File.
    const child = spawn(powershell, f.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const result = await observeLauncher(child, { id, onState: (value) => states.push(value), installing: () => false,
      inspect: async () => { throw new Error('recovery-required'); }, startupMs: 10000, timeoutMs: 15000 });
    assert.deepEqual(states, [], mode); assert.deepEqual(result, { status: 'failed', reason: 'recovery-required' });
  }
  const child = spawn(path.join(os.tmpdir(), 'Clackly-R20-no-such-powershell.exe'), [], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const states = [];
  assert.deepEqual(await observeLauncher(child, { id, onState: (value) => states.push(value), installing: () => false, inspect: async () => null }),
    { status: 'failed', reason: 'recovery-required' });
  assert.deepEqual(states, []);
});

test('independent launcher parent-exit diagnostic distinguishes blocked launch from proven survival', { skip: process.platform !== 'win32' }, async (t) => {
  const f = fixture(); const parentScript = path.join(f.root, 'parent.cjs');
  fs.writeFileSync(parentScript, [
    "const fs=require('node:fs'); const {spawn}=require('node:child_process');",
    'const {observeLauncher,spawnLauncher}=require(' + JSON.stringify(path.join(__dirname, 'WorkflowInstaller.js')) + ');',
    'const child=spawnLauncher(' + JSON.stringify(powershell) + ',' + JSON.stringify(path.join(f.root, 'launch.ps1')) + ',' + JSON.stringify(id) + ');',
    'child.stdout.on("data",(bytes)=>fs.appendFileSync(' + JSON.stringify(path.join(f.root, 'launch-stdout.txt')) + ',bytes));',
    'child.on("error",(error)=>fs.writeFileSync(' + JSON.stringify(path.join(f.root, 'spawn-error.json')) + ',JSON.stringify({message:error.message,code:error.code})));',
    'child.on("exit",(code)=>fs.writeFileSync(' + JSON.stringify(path.join(f.root, 'launch-exit.json')) + ',JSON.stringify({code})));',
    'observeLauncher(child,{id:' + JSON.stringify(id) + ",installing:()=>false,inspect:async()=>({status:'failed',reason:'recovery-required'}),onState:(state)=>{",
    'fs.writeFileSync(' + JSON.stringify(path.join(f.root, 'parent-ack.json')) + ',JSON.stringify(state)); process.exit(0); }}).then((result)=>fs.writeFileSync(' + JSON.stringify(path.join(f.root, 'parent-outcome.json')) + ',JSON.stringify(result)));'
  ].join('\n'));
  const parent = spawn(process.execPath, [parentScript], { windowsHide: true, stdio: 'ignore' });
  const code = await new Promise((resolve, reject) => { parent.once('error', reject); parent.once('exit', resolve); });
  assert.equal(code, 0);
  if (!fs.existsSync(path.join(f.root, 'parent-ack.json'))) {
    const outcome = JSON.parse(fs.readFileSync(path.join(f.root, 'parent-outcome.json'), 'utf8'));
    assert.deepEqual(outcome, { status: 'failed', reason: 'recovery-required' });
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'parent-exit-diagnostic.json'), JSON.stringify({ root:f.root, result:'blocked-before-ack', outcome,
      launcher:fs.existsSync(path.join(f.request, 'launcher.json')), parentExit:code, survival:'Pending: no acknowledged launcher on this host' }, null, 2));
    t.diagnostic('Blocked before readiness; parent-exit survival is Pending, not proven by this passing refusal test.');
    return;
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'parent-ack.json'))).status, 'waiting-for-exit');
  await until(() => fs.existsSync(path.join(f.root, 'worker-started.json')));
  assert.equal(fs.existsSync(path.join(f.root, 'worker-finished')), false);
  assert.equal(fs.existsSync(path.join(f.request, 'stopped.json')), false);
  fs.writeFileSync(path.join(f.root, 'release-worker'), 'parent gone; complete inert work');
  await until(() => fs.existsSync(path.join(f.request, 'stopped.json')));
  assert.equal(fs.readFileSync(path.join(f.root, 'worker-finished'), 'utf8'), 'inert completion');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'parent-exit-diagnostic.json'), JSON.stringify({ root:f.root, result:'acknowledged-and-survived', parentExit:code }, null, 2));
});

test('bounded launch-option diagnostic records evidence without treating a local failure as product success', { skip: process.platform !== 'win32' }, async (t) => {
  const records = [];
  for (const detached of [true, false]) {
    const f = fixture();
    const child = spawn(powershell, f.args, { detached, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let code;
    child.stdout.on('data', (bytes) => { stdout += bytes; });
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (value) => { code=value; resolve(); }); });
    // Inert release may be set before worker starts, so no production deadline
    // is extended and no real process is killed to gather this comparison.
    fs.writeFileSync(path.join(f.root, 'release-worker'), 'inert complete');
    await done;
    const record = { detached, windowsHide:true, stdio:['ignore','pipe','pipe'], code, stdout, stderr,
      launcher:fs.existsSync(path.join(f.request,'launcher.json')), stopped:fs.existsSync(path.join(f.request,'stopped.json')),
      workerFinished:fs.existsSync(path.join(f.root,'worker-finished')) };
    records.push(record); t.diagnostic(JSON.stringify(record));
  }
  fs.mkdirSync(evidence, {recursive:true});
  fs.writeFileSync(path.join(evidence,'launch-option-diagnostic.json'),JSON.stringify({platform:process.platform,node:process.version,powershell,records},null,2));
});
