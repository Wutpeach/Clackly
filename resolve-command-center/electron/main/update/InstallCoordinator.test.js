const test = require('node:test');
const assert = require('node:assert/strict');
const { InstallCoordinator } = require('./InstallCoordinator');
const candidate = { name: 'a'.repeat(32) + '.exe', version: '0.2.0' };

test('only a fresh explicit confirmation starts an installer, and handoff is never installed', async () => {
  let starts = 0; const states = [];
  const coordinator = new InstallCoordinator({ publish: (state) => states.push(state.status), installer: {
    qualify: async () => ({ ready: true }), start: async () => { starts++; return { status: 'handed-off' }; }
  } });
  await coordinator.setCandidate(candidate); await coordinator.confirm(); assert.equal(starts, 0);
  await coordinator.prepare(); coordinator.invalidateConfirmation(); await coordinator.confirm(); assert.equal(starts, 0);
  await coordinator.prepare(); await coordinator.cancel(); await coordinator.confirm(); assert.equal(starts, 0);
  await coordinator.prepare(); await coordinator.confirm();
  assert.equal(starts, 1); assert.equal(coordinator.state.status, 'handed-off');
  await coordinator.cancel(); await coordinator.prepare(); await coordinator.confirm();
  assert.equal(starts, 1); assert.equal(coordinator.state.status, 'handed-off');
  assert.equal(states.includes('installed'), false);
});

test('a Windows launch error retains the candidate for explicit retry', async () => {
  let fail = true;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: async () => fail ? { status: 'failed', reason: 'launch-failed' } : { status: 'handed-off' } } });
  await coordinator.setCandidate(candidate); await coordinator.prepare(); await coordinator.confirm();
  assert.deepEqual(coordinator.state, { status: 'failed', reason: 'launch-failed' });
  assert.equal(coordinator.candidate, candidate);
  fail = false; await coordinator.confirm(); assert.equal(coordinator.state.status, 'failed');
  await coordinator.prepare(); await coordinator.confirm(); assert.equal(coordinator.state.status, 'handed-off');
});

test('cancelling confirmation invalidates delayed preparation; launching has no fake cancel', async () => {
  let ready; let finish;
  const installer = { qualify: async () => ({ ready: true }), start: () => new Promise((resolve) => { finish = resolve; }) };
  const coordinator = new InstallCoordinator({ installer });
  await coordinator.setCandidate(candidate); await coordinator.prepare();
  installer.qualify = () => new Promise((resolve) => { ready = resolve; });
  const delayed = coordinator.prepare(); await coordinator.cancel(); ready({ ready: true }); await delayed;
  assert.equal(coordinator.state.status, 'cancelled');
  installer.qualify = async () => ({ ready: true });
  await coordinator.prepare(); const launch = coordinator.confirm();
  await new Promise(setImmediate);
  await coordinator.cancel(); assert.equal(coordinator.state.status, 'starting');
  finish({ status: 'handed-off' }); await launch; assert.equal(coordinator.state.status, 'handed-off');
});
