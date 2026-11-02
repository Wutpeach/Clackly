// Main-process only: renderer intents never supply an executable or package path.
const REASONS = new Set(['qualification-required', 'unsupported-host', 'no-candidate', 'invalid-package', 'launch-failed']);
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
  emit(status, reason = null) {
    if (this.disposed) return;
    this.state = { status, reason: reason === null || REASONS.has(reason) ? reason : 'qualification-required' };
    this.publish({ ...this.state });
  }
  isRunning() { return this.operation !== null || this.state.status === 'handed-off'; }
  invalidateConfirmation() {
    this.revision++;
    this.confirmation = null;
    if (this.state.status === 'awaiting-confirmation') this.emit('ready');
  }
  async qualify(candidate) {
    if (!candidate) return { ready: false, reason: 'no-candidate' };
    if (!this.installer?.qualify || !this.installer?.start) return { ready: false, reason: 'qualification-required' };
    try { return await this.installer.qualify(candidate); }
    catch { return { ready: false, reason: 'qualification-required' }; }
  }
  async setCandidate(candidate) {
    if (this.isRunning()) return;
    this.invalidateConfirmation();
    this.candidate = candidate;
    const result = await this.qualify(candidate);
    if (candidate !== this.candidate) return;
    this.emit(result.ready ? 'ready' : 'unavailable', result.ready ? null : result.reason);
  }
  async prepare() {
    if (this.isRunning() || this.disposed) return;
    const candidate = this.candidate;
    const revision = ++this.revision;
    const result = await this.qualify(candidate);
    if (candidate !== this.candidate || revision !== this.revision || this.disposed) return;
    this.confirmation = result.ready ? candidate : null;
    this.emit(result.ready ? 'awaiting-confirmation' : 'unavailable', result.ready ? null : result.reason);
  }
  async confirm() {
    if (this.isRunning() || this.disposed || !this.candidate || this.confirmation !== this.candidate) return;
    const candidate = this.candidate;
    const revision = ++this.revision;
    this.confirmation = null;
    this.operation = true;
    try {
      const result = await this.qualify(candidate);
      if (this.disposed || revision !== this.revision) return;
      if (!result.ready) { this.emit('unavailable', result.reason); return; }
      this.emit('starting');
      const outcome = await this.installer.start(candidate);
      if (outcome?.status === 'handed-off') this.emit('handed-off');
      else this.emit('failed', REASONS.has(outcome?.reason) ? outcome.reason : 'launch-failed');
    } catch { this.emit('failed', 'launch-failed'); }
    finally { this.operation = null; }
  }
  async cancel() {
    if (this.disposed || this.state.status !== 'awaiting-confirmation') return;
    this.revision++;
    this.confirmation = null;
    this.emit('cancelled');
  }
  dispose() {
    this.disposed = true;
    this.confirmation = null;
    // The Windows shell owns the launched EXE; host disposal never terminates it.
  }
}
module.exports = { InstallCoordinator };
