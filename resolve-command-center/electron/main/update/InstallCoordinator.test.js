const test = require('node:test');
const assert = require('node:assert/strict');
const { InstallCoordinator } = require('./InstallCoordinator');
const candidate = { name: 'a'.repeat(32) + '.zip', version: '0.2.0', digest: 'b'.repeat(64), size: 100 };
test('confirmation requires the same retained candidate and repeats qualification before handoff', async () => {
  let ready = true; const started = []; const states = [];
  const coordinator = new InstallCoordinator({ publish: (state) => states.push(state), installer: {
    qualify: async () => ({ ready, reason: 'publisher-unverified' }),
    start: async (value, { onState }) => { started.push(value); onState({ status: 'installing' }); return { status: 'installed' }; } } });
  await coordinator.setCandidate(candidate); await coordinator.confirm(); assert.equal(started.length, 0);
  await coordinator.prepare(); assert.equal(coordinator.state.status, 'awaiting-confirmation');
  ready = false; await coordinator.confirm(); assert.equal(started.length, 0);
  assert.deepEqual(coordinator.state, { status: 'unavailable', reason: 'publisher-unverified' });
  ready = true; await coordinator.prepare(); await coordinator.confirm(); assert.deepEqual(started, [candidate]);
  assert.deepEqual(states.slice(-3).map((state) => state.status), ['waiting-for-exit', 'installing', 'installed']);
  await coordinator.confirm(); assert.equal(started.length, 1);
  await coordinator.cancel(); assert.equal(coordinator.state.status, 'installed');
});
test('cancel and changed candidate invalidate prepared confirmation; qualification errors never leak paths', async () => {
  let started = 0;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: async () => { started++; return { status: 'installed' }; } } });
  await coordinator.setCandidate(candidate); await coordinator.prepare(); await coordinator.cancel(); await coordinator.confirm();
  assert.equal(coordinator.state.status, 'cancelled'); assert.equal(started, 0);
  await coordinator.prepare(); await coordinator.setCandidate({ ...candidate, version: '0.3.0' });
  await coordinator.confirm(); assert.equal(started, 0);
  coordinator.installer.qualify = async () => { throw Object.assign(new Error('C:/private/path'), { code: 'EACCES' }); };
  await coordinator.prepare(); assert.deepEqual(coordinator.state, { status: 'unavailable', reason: 'qualification-required' });
});
test('in-flight qualification cancellation prevents executor launch and host disposal suppresses stale state', async () => {
  let qualify; let started = 0;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: async () => { started++; return { status: 'installed' }; }, cancel: async () => ({ status: 'cancelled' }) } });
  await coordinator.setCandidate(candidate); await coordinator.prepare();
  coordinator.installer.qualify = () => new Promise((resolve) => { qualify = resolve; });
  const confirmation = coordinator.confirm(); await coordinator.cancel(); qualify({ ready: true }); await confirmation;
  assert.equal(started, 0); assert.equal(coordinator.state.status, 'cancelled');
  const states = []; coordinator.publish = (value) => states.push(value); coordinator.dispose();
  await coordinator.prepare(); assert.deepEqual(states, []);
});
test('executor rollback is projected and cancellation is not claimed without executor acknowledgment', async () => {
  let finish; const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: () => new Promise((resolve) => { finish = resolve; }), cancel: async () => ({ status: 'installing' }) } });
  await coordinator.setCandidate(candidate); await coordinator.prepare(); const running = coordinator.confirm();
  await new Promise((resolve) => setImmediate(resolve)); await coordinator.cancel();
  assert.equal(coordinator.state.status, 'installing'); assert.equal(coordinator.isRunning(), true);
  finish({ status: 'rolled-back', reason: 'install-failed' }); await running;
  assert.deepEqual(coordinator.state, { status: 'rolled-back', reason: 'install-failed' });
});
test('acknowledged wait cancellation settles once without aborting the independent handoff', async () => {
  let finish; let report; let signal;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: (_value, options) => { report = options.onState; signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
    cancel: async () => ({ status: 'cancelled', reason: null }) } });
  await coordinator.setCandidate(candidate); await coordinator.prepare();
  const running = coordinator.confirm(); await new Promise((resolve) => setImmediate(resolve));
  await coordinator.cancel();
  assert.deepEqual(coordinator.state, { status: 'cancelled', reason: null });
  assert.equal(signal.aborted, false);
  report({ status: 'waiting-for-exit' }); report({ status: 'installed' });
  finish({ status: 'cancelled' }); await running;
  assert.deepEqual(coordinator.state, { status: 'cancelled', reason: null });
  await coordinator.prepare(); assert.equal(coordinator.state.status, 'awaiting-confirmation');
});
test('backup boundary removes cancellation and stale wait/cancel cannot overwrite installation', async () => {
  let report; let finish; let finishCancel; let cancellations = 0;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: (_value, { onState }) => { report = onState; return new Promise((resolve) => { finish = resolve; }); },
    cancel: () => { cancellations++; return new Promise((resolve) => { finishCancel = resolve; }); } } });
  await coordinator.setCandidate(candidate); await coordinator.prepare();
  const running = coordinator.confirm(); await new Promise((resolve) => setImmediate(resolve));
  const cancelling = coordinator.cancel();
  report({ status: 'installing' }); finishCancel({ status: 'cancelled' }); await cancelling;
  await coordinator.cancel(); report({ status: 'waiting-for-exit' });
  assert.equal(cancellations, 1, 'no executor cancellation request after backup starts');
  assert.equal(coordinator.state.status, 'installing');
  report({ status: 'installed' }); report({ status: 'waiting-for-exit' });
  finish({ status: 'installed' }); await running;
  assert.equal(coordinator.state.status, 'installed');
});
test('cancellation transport failure retains the true waiting state and allows retry', async () => {
  let finish; let reject = true;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
    start: () => new Promise((resolve) => { finish = resolve; }),
    cancel: async () => { if (reject) throw new Error('C:/private'); return { status: 'cancelled' }; } } });
  await coordinator.setCandidate(candidate); await coordinator.prepare();
  const running = coordinator.confirm(); await new Promise((resolve) => setImmediate(resolve));
  await coordinator.cancel(); assert.equal(coordinator.state.status, 'waiting-for-exit');
  reject = false; await coordinator.cancel(); assert.equal(coordinator.state.status, 'cancelled');
  finish({ status: 'cancelled' }); await running;
});
test('cancel during prepare prevents late qualification from reopening confirmation', async () => {
  let qualify;
  const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }), start: async () => ({ status: 'installed' }) } });
  await coordinator.setCandidate(candidate);
  coordinator.installer.qualify = () => new Promise((resolve) => { qualify = resolve; });
  const preparing = coordinator.prepare(); await coordinator.cancel(); qualify({ ready: true }); await preparing;
  assert.equal(coordinator.state.status, 'cancelled'); assert.equal(coordinator.confirmation, null);
});
test('late cancellation responses cannot overwrite a completed installation outcome', async () => {
  for (const rejectCancel of [false, true]) {
    let finish; let finishCancel;
    const coordinator = new InstallCoordinator({ installer: { qualify: async () => ({ ready: true }),
      start: () => new Promise((resolve) => { finish = resolve; }),
      cancel: () => new Promise((resolve, reject) => {
        finishCancel = () => rejectCancel ? reject(new Error('late failure')) : resolve({ status: 'cancelled' });
      }) } });
    await coordinator.setCandidate(candidate); await coordinator.prepare();
    const running = coordinator.confirm(); await new Promise((resolve) => setImmediate(resolve));
    const cancelling = coordinator.cancel();
    finish({ status: 'installed' }); await running;
    finishCancel(); await cancelling;
    assert.deepEqual(coordinator.state, { status: 'installed', reason: null });
  }
});
test('restart restores only bounded adapter results and never restores a confirmation', async () => {
  for (const state of [{ status: 'installed', reason: null }, { status: 'rolled-back', reason: 'install-failed' },
    { status: 'failed', reason: 'recovery-required' }, { status: 'cancelled', reason: null }]) {
    const coordinator = new InstallCoordinator({ installer: { readState: async () => ({ ...state, path: 'C:/private' }) } });
    await coordinator.restore(); assert.deepEqual(coordinator.state, state); assert.equal(coordinator.confirmation, null);
  }
  for (const value of [undefined, {}, { status: 'installed', reason: 'C:/private' }, { status: 'ready', reason: null }]) {
    const coordinator = new InstallCoordinator({ installer: { readState: async () => value } });
    await coordinator.restore(); assert.deepEqual(coordinator.state, { status: 'failed', reason: 'recovery-required' });
  }
});
test('unverified restart outcome blocks fresh confirmation until recovery and survives candidate changes', async () => {
  let result = { status: 'failed', reason: 'recovery-required' };
  const coordinator = new InstallCoordinator({ installer: { readState: async () => result,
    qualify: async () => ({ ready: true }), start: async () => ({ status: 'installed' }) } });
  await coordinator.restore(); await coordinator.setCandidate(candidate); await coordinator.prepare(); await coordinator.confirm();
  assert.deepEqual(coordinator.state, result); await coordinator.setCandidate(null); assert.deepEqual(coordinator.state, result);
  result = { status: 'rolled-back', reason: 'install-failed' }; await coordinator.restore();
  assert.deepEqual(coordinator.state, result);
});
