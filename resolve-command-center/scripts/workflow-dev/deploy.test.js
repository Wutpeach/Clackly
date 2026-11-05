const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inventory, installWithBackup, rollback, copyVerified, owned } = require('./deploy');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-dev-deploy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'scan/com.wutpeach.clackly');
  const session = path.join(root, 'sessions/one');
  const data = path.join(root, 'AppData');
  const neighbor = path.join(root, 'scan/other-plugin');
  for (const directory of [target, session, data, neighbor]) fs.mkdirSync(directory, { recursive: true });
  for (const name of ['app.js', 'unins000.exe', 'unins000.dat']) fs.writeFileSync(path.join(target, name), 'old ' + name);
  fs.writeFileSync(path.join(data, 'settings.json'), 'user configuration');
  fs.writeFileSync(path.join(neighbor, 'plugin.js'), 'another plugin');
  const f = { root, target, session, data, neighbor, closed: true, registry: 'old-registry', installs: 0 };
  f.before = inventory(target);
  f.options = {
    target, session, inspect: () => { if (!f.closed) throw new Error('host-running'); },
    exportRegistry: () => {
      fs.writeFileSync(path.join(session, 'uninstall.reg'), f.registry);
      fs.writeFileSync(path.join(session, 'permissions.acl'), 'old-permissions');
    },
    restoreRegistry: () => { f.registry = fs.readFileSync(path.join(session, 'uninstall.reg'), 'utf8'); },
    preserved: () => ({ data: inventory(data), neighbor: inventory(neighbor) }),
    install: () => {
      f.installs++; f.registry = 'new-registry';
      fs.writeFileSync(path.join(target, 'app.js'), 'new app');
      fs.writeFileSync(path.join(target, 'new-command.js'), 'new command');
      return 0;
    },
    verify: () => assert.equal(fs.readFileSync(path.join(target, 'app.js'), 'utf8'), 'new app')
  };
  return f;
}

test('deployment retains the full old tree and restores files and uninstall metadata on explicit rollback', async (t) => {
  const f = fixture(t); const preserved = f.options.preserved();
  const journal = await installWithBackup(f.options);
  assert.equal(journal.status, 'installed');
  assert.deepEqual(inventory(path.join(f.session, 'previous')), f.before);
  rollback({ ...f.options, journal });
  assert.deepEqual(inventory(f.target), f.before);
  assert.equal(f.registry, 'old-registry');
  assert.equal(fs.readFileSync(path.join(f.session, 'replaced/new-command.js'), 'utf8'), 'new command');
  assert.deepEqual(f.options.preserved(), preserved);
});

for (const kind of ['installer-failure', 'verification-failure']) test(kind + ' automatically restores the exact previous installation', async (t) => {
  const f = fixture(t); const install = f.options.install;
  if (kind === 'installer-failure') f.options.install = () => { install(); return 5; };
  else f.options.verify = () => { throw new Error('payload-hash-mismatch'); };
  await assert.rejects(installWithBackup(f.options), /rolled-back/);
  assert.deepEqual(inventory(f.target), f.before);
  assert.equal(f.registry, 'old-registry');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.session, 'deployment.json'))).status, 'rolled-back');
});

test('running host refuses deployment without moving any installed files', async (t) => {
  const f = fixture(t); f.closed = false;
  await assert.rejects(installWithBackup(f.options), /host-running/);
  assert.deepEqual(inventory(f.target), f.before);
  assert.equal(f.installs, 0);
});

test('host reopened during failure blocks rollback and preserves backup and failure evidence', async (t) => {
  const f = fixture(t);
  f.options.verify = () => { f.closed = false; throw new Error('verification-failed'); };
  await assert.rejects(installWithBackup(f.options), /recovery-required/);
  assert.deepEqual(inventory(path.join(f.session, 'previous')), f.before);
  assert.equal(fs.readFileSync(path.join(f.target, 'app.js'), 'utf8'), 'new app');
});

for (const kind of ['backup', 'registry', 'permissions', 'installed']) test('modified ' + kind + ' refuses rollback before replacing files', async (t) => {
  const f = fixture(t); const journal = await installWithBackup(f.options);
  const file = kind === 'backup' ? path.join(f.session, 'previous/app.js')
    : kind === 'registry' ? path.join(f.session, 'uninstall.reg') : kind === 'permissions' ? path.join(f.session, 'permissions.acl') : path.join(f.target, 'app.js');
  fs.writeFileSync(file, 'unexpected modification');
  assert.throws(() => rollback({ ...f.options, journal }), /changed/);
  assert.equal(f.registry, 'new-registry');
  assert.equal(fs.existsSync(path.join(f.target, 'new-command.js')), true);
});

test('changed install during backup is rejected before launching installer', async (t) => {
  const f = fixture(t); let inspections = 0;
  f.options.inspect = () => { if (++inspections === 2) fs.writeFileSync(path.join(f.target, 'app.js'), 'concurrent change'); };
  await assert.rejects(installWithBackup(f.options), /changed before installation/);
  assert.equal(f.installs, 0);
});

test('backup never follows junctions or overwrites an existing recovery directory', (t) => {
  const f = fixture(t);
  const linked = path.join(f.root, 'link');
  fs.symlinkSync(f.target, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => copyVerified(linked, path.join(f.session, 'copied')), /unsafe/);
  assert.throws(() => copyVerified(f.target, f.session), /exists/);
  assert.throws(() => owned(f.session, f.target), /escapes/);
});
