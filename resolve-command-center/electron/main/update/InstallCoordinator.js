// Main-process only. Renderer intents never provide a target, executable, or package path.
const REASONS = new Set(['qualification-required', 'publisher-unverified', 'host-unqualified',
  'target-unverified', 'permission-denied', 'permission-cancelled', 'process-unknown', 'host-running',
  'concurrent-install', 'recovery-required', 'invalid-package', 'install-failed', 'no-candidate', 'unsupported-host',
  'native-missing', 'native-invalid', 'native-incompatible']);
const RESULTS = new Set(['waiting-for-exit', 'installing', 'installed', 'rolled-back', 'failed', 'cancelled']);
const TERMINAL = new Set(['installed', 'rolled-back', 'failed', 'cancelled']);
function reason(value, fallback = 'qualification-required') { return REASONS.has(value) ? value : fallback; }
class InstallCoordinator {
  constructor({ installer, publish = () => {} } = {}) {
    this.installer = installer;
    this.publish = publish;
    this.candidate = null;
    this.confirmation = null;
    this.operation = null;
    this.disposed = false;
    this.revision = 0;
    this.state = { status: 'unavailable', reason: 'no-candidate' };
  }
  emit(status, code = null) {
    if (this.disposed) return;
    this.state = { status, reason: code === null ? null : reason(code) };
    this.publish({ ...this.state });
  }
  isRunning() { return this.operation !== null || ['waiting-for-exit', 'installing'].includes(this.state.status); }
  async restore() {
    if (this.disposed || typeof this.installer?.readState !== 'function') return;
    this.confirmation = null;
    try {
      // Only the fixed host adapter validates pointer/journal/installed-tree facts.
      // A cached snapshot or renderer-provided JSON is never an installation result.
      const result = await this.installer.readState();
      if (result === null) return;
      if (!RESULTS.has(result?.status) || result.reason !== null && !REASONS.has(result.reason)) {
        this.emit('failed', 'recovery-required');
        return;
      }
      this.emit(result.status, result.reason);
    } catch { this.emit('failed', 'recovery-required'); }
  }
  invalidateConfirmation() {
    this.revision++;
    this.confirmation = null;
    if (this.state.status === 'awaiting-confirmation') this.emit('ready');
  }
  async qualify(candidate) {
    if (!candidate) return { ready: false, reason: 'no-candidate' };
    if (!this.installer || typeof this.installer.qualify !== 'function' || typeof this.installer.start !== 'function') {
      return { ready: false, reason: 'qualification-required' };
    }
    try {
      const result = await this.installer.qualify(structuredClone(candidate));
      return result?.ready === true ? { ready: true, reason: null }
        : { ready: false, reason: reason(result?.reason) };
    } catch (error) { return { ready: false, reason: reason(error?.code) }; }
  }
  async setCandidate(candidate) {
    if (this.isRunning()) return;
    const recoveryRequired = this.state.status === 'failed' && this.state.reason === 'recovery-required';
    this.revision++;
    this.candidate = candidate;
    this.confirmation = null;
    if (recoveryRequired) return;
    const result = await this.qualify(candidate);
    if (candidate !== this.candidate) return;
    this.emit(result.ready ? 'ready' : 'unavailable', result.reason);
  }
  async prepare() {
    if (this.isRunning() || this.disposed) return;
    if (this.state.status === 'failed' && this.state.reason === 'recovery-required') return;
    const candidate = this.candidate;
    const revision = ++this.revision;
    const result = await this.qualify(candidate);
    if (candidate !== this.candidate || revision !== this.revision || this.disposed) return;
    this.confirmation = result.ready ? candidate : null;
    this.emit(result.ready ? 'awaiting-confirmation' : 'unavailable', result.reason);
  }
  async confirm() {
    if (this.isRunning() || this.disposed || !this.candidate || this.confirmation !== this.candidate) return;
    const candidate = this.candidate;
    this.confirmation = null;
    const operation = { controller: new AbortController(), phase: 'qualifying' };
    this.operation = operation;
    try {
      const qualified = await this.qualify(candidate);
      if (operation.controller.signal.aborted || this.disposed || candidate !== this.candidate) return;
      if (!qualified.ready) { this.emit('unavailable', qualified.reason); return; }
      operation.phase = 'waiting-for-exit';
      this.emit('waiting-for-exit');
      const result = await this.installer.start(structuredClone(candidate), { signal: operation.controller.signal,
        onState: (state) => this.acceptResult(operation, state) });
      this.acceptResult(operation, RESULTS.has(result?.status) ? result : { status: 'failed', reason: 'install-failed' });
    } catch (error) {
      this.acceptResult(operation, { status: 'failed', reason: reason(error?.code, 'install-failed') });
    } finally { if (this.operation === operation) this.operation = null; }
  }
  acceptResult(operation, result) {
    if (this.disposed || this.operation !== operation || operation.controller.signal.aborted
      || operation.phase === 'finished' || !RESULTS.has(result?.status)) return;
    // File switching is irreversible from Settings. Never reopen its wait/cancel affordance.
    if (operation.phase === 'installing' && ['waiting-for-exit', 'cancelled'].includes(result.status)) return;
    operation.phase = TERMINAL.has(result.status) ? 'finished' : result.status;
    this.emit(result.status, result.reason ?? null);
  }
  async cancel() {
    this.revision++;
    this.confirmation = null;
    const operation = this.operation;
    if (this.disposed || this.state.status === 'installing' || TERMINAL.has(this.state.status)
      || this.state.status === 'unavailable') return;
    if (operation?.phase === 'qualifying') {
      operation.controller.abort();
      this.emit('cancelled');
    } else if (this.state.status === 'waiting-for-exit') {
      // The independent executor arbitrates cancellation against its backup/replace boundary.
      // A rejected or missing acknowledgment leaves waiting intact so the user can retry.
      if (operation?.cancellation) return operation.cancellation;
      const stillWaiting = () => !this.disposed && this.operation === operation && this.state.status === 'waiting-for-exit';
      const cancellation = (async () => {
        try {
          const result = await this.installer.cancel?.();
          if (!stillWaiting()) return;
          if (operation) this.acceptResult(operation, result);
          else if (RESULTS.has(result?.status)) this.emit(result.status, result.reason ?? null);
        } catch { /* A cancellation transport failure is not an installation outcome. */ }
      })();
      if (operation) operation.cancellation = cancellation;
      try { await cancellation; } finally { if (operation) operation.cancellation = null; }
    } else if (this.candidate) this.emit('cancelled');
  }
  dispose() {
    this.disposed = true;
    this.confirmation = null;
    // A handed-off independent executor must survive host exit; do not abort it here.
  }
}
module.exports = { InstallCoordinator };
