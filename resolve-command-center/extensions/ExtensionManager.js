const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const semver = require('semver');
const { SchemaValidator } = require('../config/SchemaValidator');
const { readPackage, validateManifest, safePath, fail, ID } = require('./package');

const CAPABILITY = 'extensions.python';
const validator = new SchemaValidator();
const commandId = (extension, command) => 'extension:' + extension + '/' + command;
function assertPlainPath(target) {
  let current = path.resolve(target);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw fail('EXTENSION_UNSAFE_PATH', '扩展目录不允许符号链接或目录联接。');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function inventory(root) {
  assertPlainPath(root);
  const files = {};
  function walk(directory, prefix = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + item.name;
      safePath(relative);
      const file = path.join(directory, item.name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) throw fail('EXTENSION_UNSAFE_PATH', '扩展文件不允许链接。');
      if (stat.isDirectory()) walk(file, relative + '/');
      else files[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  walk(root);
  return JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

class ExtensionManager {
  constructor({ root, executePython, checkAvailability, onChanged = () => {} }) {
    this.root = path.resolve(root);
    this.executePython = executePython;
    this.checkAvailability = checkAvailability;
    this.runtimeStatus = checkAvailability ? 'loading' : 'ready';
    this.runtimeError = null;
    this.onChanged = onChanged;
    this.listeners = new Set();
    this.previews = new Map();
    this.active = new Map();
    this.prepared = new Map();
    this.mutating = new Set();
    this.statePath = path.join(this.root, 'state.json');
    assertPlainPath(this.statePath);
    this.state = {};
    try {
      this.state = fs.existsSync(this.statePath) ? JSON.parse(fs.readFileSync(this.statePath, 'utf8')) : {};
      if (!this.state || typeof this.state !== 'object' || Array.isArray(this.state)) throw new Error('Invalid state');
    } catch {
      this.state = {};
      this.loadError = fail('EXTENSION_STATE_INVALID', '扩展状态损坏，未覆盖现有文件。请恢复 state.json 后重新打开 Clackly。');
    }
    this.errors = new Map();
    for (const [id, record] of Object.entries(this.state)) {
      try {
        if (!ID.test(id)) throw new Error('Invalid extension ID');
        if (record.revision) {
          validateManifest(record.manifest);
          if (typeof record.enabled !== 'boolean') throw new Error('Invalid enabled state');
          this.verify(id, record);
        }
      } catch (error) { this.errors.set(id, error.message); }
    }
  }
  revisionPath(id, record) {
    if (!ID.test(id) || !/^[a-f0-9-]{36}$/.test(record.revision || '')) throw fail('EXTENSION_STATE_INVALID', '受管扩展路径无效。');
    return path.join(this.root, 'packages', id, record.revision);
  }
  pythonCachePath(id, record) {
    this.revisionPath(id, record);
    return path.join(this.root, 'cache', 'python', id, record.revision);
  }
  removePythonCache(id, record) {
    const target = this.pythonCachePath(id, record);
    assertPlainPath(target);
    fs.rmSync(target, { recursive: true, force: true });
  }
  verify(id, record) {
    const root = this.revisionPath(id, record);
    if (inventory(root) !== record.inventory) throw fail('EXTENSION_FILES_CHANGED', '扩展文件已变化，请重新导入包。');
    const manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')));
    if (manifest.id !== id || JSON.stringify(manifest) !== JSON.stringify(record.manifest)) throw fail('EXTENSION_STATE_INVALID', '扩展 Manifest 与安装记录不符。');
    return root;
  }
  persist(next) {
    if (this.loadError) throw this.loadError;
    assertPlainPath(this.statePath);
    fs.mkdirSync(this.root, { recursive: true });
    const lock = path.join(this.root, 'state.lock');
    assertPlainPath(lock);
    let lockFd;
    try { lockFd = fs.openSync(lock, 'wx'); }
    catch { throw fail('EXTENSION_STATE_BUSY', '扩展状态正由另一个进程写入，请稍后重试。'); }
    const temp = path.join(this.root, randomUUID() + '.tmp');
    let committed = false;
    try {
      const disk = fs.existsSync(this.statePath) ? JSON.parse(fs.readFileSync(this.statePath, 'utf8')) : {};
      if (JSON.stringify(disk) !== JSON.stringify(this.state)) throw fail('EXTENSION_STATE_CHANGED', '另一个 Clackly 已修改扩展配置，请重新打开此实例后重试。');
      const fd = fs.openSync(temp, 'wx');
      try { fs.writeFileSync(fd, JSON.stringify(next, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.statePath);
      this.state = next;
      // Any changed installation/configuration invalidates its pending data immediately.
      for (const [token, item] of this.prepared) if (this.state[item.extensionId] !== item.record) this.prepared.delete(token);
      committed = true;
    } finally {
      try {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
        fs.closeSync(lockFd); fs.unlinkSync(lock);
      } catch (error) { if (!committed) throw error; }
    }
    this.notify();
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() {
    try { this.onChanged(); } catch { /* Notification cannot undo a committed state. */ }
    for (const listener of this.listeners) { try { listener(); } catch { /* Renderer closed. */ } }
  }
  async refreshAvailability() {
    if (!this.checkAvailability || !Object.values(this.state).some((record) => record?.revision)) return;
    if (this.availabilityPromise) return this.availabilityPromise;
    this.availabilityPromise = (async () => {
      let status = 'ready', error = null;
      try {
        const result = await this.checkAvailability();
        if (!result?.ok) throw new Error('Resolve Python Runtime unavailable');
      } catch (caught) { status = 'unavailable'; error = caught.code || 'EXTENSION_RUNTIME_UNAVAILABLE'; }
      const changed = status !== this.runtimeStatus || error !== this.runtimeError;
      this.runtimeStatus = status; this.runtimeError = error;
      if (changed) this.notify();
    })().finally(() => { this.availabilityPromise = null; });
    return this.availabilityPromise;
  }
  values(record) {
    const values = {};
    for (const [key, field] of Object.entries(record.manifest.configSchema)) {
      const old = record.configSchema?.[key];
      if (!old || old.type !== field.type || !Object.hasOwn(record.config || {}, key)) continue;
      try { validator.validateValues({ [key]: field }, { [key]: record.config[key] }); values[key] = record.config[key]; } catch { /* Incompatible values never reach a script. */ }
    }
    return values;
  }
  list() {
    if (this.loadError) throw this.loadError;
    return Object.entries(this.state).filter(([, record]) => record?.revision).map(([id, record]) => {
      if (this.errors.has(id)) return { id, name: typeof record.manifest?.name === 'string' ? record.manifest.name : id,
        version: '', description: '', source: '', configSchema: {}, commands: [], values: {}, missing: [],
        enabled: false, status: 'error', error: this.errors.get(id) };
      const values = this.values(record);
      const missing = validator.getMissingRequired(record.manifest.configSchema, values);
      return { ...structuredClone(record.manifest), enabled: record.enabled, values, missing,
        runtimeStatus: this.runtimeStatus, runtimeError: this.runtimeError,
        status: this.errors.has(id) ? 'error' : !record.enabled ? 'disabled' : missing.length ? 'needs-setup' : 'installed',
        error: this.errors.get(id) || null };
    });
  }
  commands() {
    if (this.loadError) return [];
    return this.list().filter((extension) => extension.status !== 'error').flatMap((extension) => extension.commands.map((command) => ({
      id: commandId(extension.id, command.id), name: command.name, description: command.description || extension.description,
      category: extension.name, keywords: command.keywords, icon: 'command', presentation: 'visible',
      capability: CAPABILITY, kind: 'extension', extensionId: extension.id,
      featureStatus: { id: extension.id, installed: true, enabled: extension.enabled,
        status: this.mutating.has(extension.id) ? 'loading' : extension.missing.length ? 'missing-config' : this.runtimeStatus, message: null,
        details: { missing: extension.missing, action: extension.missing.length ? 'open-settings' : null } }
    })));
  }
  async preview(file) {
    // One Settings confirmation owns one frozen, bounded candidate at a time.
    for (const token of [...this.previews.keys()]) this.cancel(token);
    const { manifest, files } = await readPackage(file);
    assertPlainPath(this.root);
    const token = randomUUID();
    const stage = path.join(this.root, 'staging', token);
    assertPlainPath(stage);
    fs.mkdirSync(stage, { recursive: true });
    try {
      for (const [name, bytes] of files) {
        const target = path.join(stage, name);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' });
      }
      const old = this.state[manifest.id];
      const previousVersion = semver.valid(old?.manifest?.version);
      const operation = !old?.revision ? 'install' : !previousVersion ? 'replace' : semver.gt(manifest.version, previousVersion) ? 'update'
        : semver.lt(manifest.version, previousVersion) ? 'downgrade' : 'replace';
      const candidate = { token, stage, manifest, operation, previous: old?.revision || null, inventory: inventory(stage) };
      this.previews.set(token, candidate);
      return { token, manifest, operation, previousVersion: old?.revision ? previousVersion : null };
    } catch (error) { this.removeDirectory(stage); throw error; }
  }
  removeDirectory(target) {
    const relative = path.relative(this.root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw fail('EXTENSION_UNSAFE_PATH', '拒绝删除非受管路径。');
    assertPlainPath(target);
    if (fs.existsSync(target)) { inventory(target); fs.rmSync(target, { recursive: true }); }
  }
  cancel(token) {
    const candidate = this.previews.get(token);
    if (!candidate) return;
    this.removeDirectory(candidate.stage); this.previews.delete(token);
  }
  async mutate(id, work) {
    if (this.mutating.has(id)) throw fail('EXTENSION_BUSY', '此扩展正在更新，请稍后重试。');
    this.mutating.add(id);
    this.notify();
    try {
      await Promise.allSettled([...(this.active.get(id) || [])]);
      return await work();
    } finally { this.mutating.delete(id); this.notify(); }
  }
  async install(token, operation) {
    const candidate = this.previews.get(token);
    if (!candidate || candidate.operation !== operation) throw fail('EXTENSION_CONFIRMATION_REQUIRED', '请重新选择包并确认安装操作。');
    const { manifest, stage } = candidate;
    await this.mutate(manifest.id, () => {
      const old = this.state[manifest.id];
      if ((old?.revision || null) !== candidate.previous) throw fail('EXTENSION_STALE_PREVIEW', '扩展已变化，请重新选择包。');
      if (inventory(stage) !== candidate.inventory) throw fail('EXTENSION_FILES_CHANGED', '待安装文件已变化，请重新选择包。');
      const revision = randomUUID();
      const next = { manifest, revision, inventory: candidate.inventory, enabled: old?.enabled ?? true,
        config: old?.config || {}, configSchema: old?.configSchema || {} };
      const target = this.revisionPath(manifest.id, next);
      assertPlainPath(target); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(stage, target);
      try { this.persist({ ...this.state, [manifest.id]: next }); }
      catch (error) { this.removeDirectory(target); this.previews.delete(token); throw error; }
      this.previews.delete(token); this.errors.delete(manifest.id);
      // A committed pointer always wins over best-effort cleanup of an inactive revision.
      if (old?.revision) { try { this.removeDirectory(this.revisionPath(manifest.id, old)); } catch { /* Inactive files cannot register commands. */ } }
      if (old?.revision) { try { this.removePythonCache(manifest.id, old); } catch { /* Cache cleanup cannot undo the committed update. */ } }
      return this.list();
    });
    await this.refreshAvailability();
    return this.list();
  }
  get(id) {
    const record = Object.hasOwn(this.state, id) ? this.state[id] : null;
    if (!record?.revision) throw fail('EXTENSION_NOT_INSTALLED', '扩展未安装。');
    return record;
  }
  saveConfig(id, values) {
    const record = this.get(id);
    if (this.mutating.has(id)) throw fail('EXTENSION_BUSY', '扩展正在更新，请稍后保存。');
    validator.validateValues(record.manifest.configSchema, values);
    if (validator.getMissingRequired(record.manifest.configSchema, values).length) throw fail('EXTENSION_NEEDS_SETUP', '请填写必填设置。');
    this.persist({ ...this.state, [id]: { ...record, config: { ...values }, configSchema: record.manifest.configSchema } });
    return this.values(this.get(id));
  }
  async setEnabled(id, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be boolean');
    return this.mutate(id, () => { this.persist({ ...this.state, [id]: { ...this.get(id), enabled } }); return this.list(); });
  }
  async uninstall(id, clearConfig) {
    if (typeof clearConfig !== 'boolean') throw new TypeError('clearConfig must be boolean');
    return this.mutate(id, () => {
      const record = this.get(id);
      const next = { ...this.state };
      if (clearConfig) delete next[id];
      else next[id] = { ...record, revision: null };
      this.persist(next); this.errors.delete(id);
      try { this.removeDirectory(this.revisionPath(id, record)); } catch { /* Inactive files are never rediscovered. */ }
      try { this.removePythonCache(id, record); } catch { /* A disposable cache cannot undo uninstall. */ }
      return this.list();
    });
  }
  describeCommand(id) {
    const command = this.commands().find((item) => item.id === id);
    if (!command) return null;
    const record = this.get(command.extensionId);
    const declared = record.manifest.commands.find((item) => commandId(command.extensionId, item.id) === id);
    return { id, name: declared.name, description: declared.description, extensionName: record.manifest.name,
      revision: record.revision, ui: declared.ui || null, ...(declared.view ? { view: declared.view, extensionId: command.extensionId } : {}) };
  }
  async requestView(id, revision, record, request) {
    const command = this.commands().find((item) => item.id === id);
    if (!command || this.get(command.extensionId) !== record || record.revision !== revision) throw fail('EXTENSION_STALE_COMMAND', '视图版本或配置已变化，请重新打开。');
    this.assertPrepareRecord(command.extensionId, record);
    const receipt = await this.execute(command, { revision, viewRequest: request, phase: request.actionId ? 'view_action' : 'view', viewAuthority: this });
    this.assertPrepareRecord(command.extensionId, record);
    if (this.mutating.has(command.extensionId)) throw fail('EXTENSION_STALE_COMMAND', '扩展正在更新，请重新打开。');
    return receipt.result;
  }
  discardPrepare(token) { this.prepared.delete(token); }
  assertPrepareRecord(id, record) {
    try {
      assertPlainPath(this.statePath);
      const disk = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      if (this.get(id) !== record || JSON.stringify(disk[id]) !== JSON.stringify(record)) throw new Error('Changed state');
    } catch { throw fail('EXTENSION_STALE_COMMAND', '扩展版本或配置已变化，请重新打开 Clackly 后运行。'); }
  }
  async prepare(id, revision) {
    const command = this.commands().find((item) => item.id === id);
    if (!command) throw fail('EXTENSION_STALE_COMMAND', '命令已变化，请重新打开。');
    const record = this.get(command.extensionId);
    const declared = record.manifest.commands.find((item) => commandId(command.extensionId, item.id) === id);
    if (!declared.ui?.prepare || record.revision !== revision) throw fail('EXTENSION_STALE_COMMAND', '扩展已变化，请重新打开命令。');
    const receipt = await this.execute(command, { revision, phase: 'prepare' });
    this.assertPrepareRecord(command.extensionId, record);
    if (this.mutating.has(command.extensionId)) throw fail('EXTENSION_STALE_COMMAND', '扩展配置或版本已变化，请重试准备。');
    const prepared = require('./commandUi').applyPrepare(declared.ui, receipt.result);
    const token = randomUUID();
    if (this.prepared.size >= 32) this.prepared.delete(this.prepared.keys().next().value);
    this.prepared.set(token, { record, extensionId: command.extensionId, commandId: id, ...prepared });
    return { token, ...prepared };
  }
  async execute(command, execution = {}) {
    const id = command.extensionId;
    if (this.mutating.has(id)) throw fail('EXTENSION_BUSY', '扩展正在更新，请稍后运行。');
    const record = this.get(id);
    if (!record.enabled) throw fail('EXTENSION_DISABLED', '扩展已禁用。');
    const config = this.values(record);
    if (validator.getMissingRequired(record.manifest.configSchema, config).length) throw fail('EXTENSION_NEEDS_SETUP', '请先配置扩展。');
    const declared = record.manifest.commands.find((item) => commandId(id, item.id) === command.id);
    const entry = declared?.entry;
    if (!entry) throw fail('EXTENSION_COMMAND_MISSING', '命令已移除。');
    const viewing = !!declared.view;
    if (viewing && execution.viewAuthority !== this) throw fail('EXTENSION_VIEW_REQUIRED', '请通过 Open View 命令打开扩展视图。');
    if (execution.revision !== undefined && execution.revision !== record.revision) throw fail('EXTENSION_STALE_COMMAND', '扩展已更新，请重新打开命令。');
    if (declared.ui && execution.revision !== record.revision) throw fail('EXTENSION_CONFIRMATION_REQUIRED', '请通过命令输入界面执行。');
    const preparing = execution.phase === 'prepare';
    if (declared.ui?.prepare) this.assertPrepareRecord(id, record);
    if (preparing && !declared.ui?.prepare) throw fail('EXTENSION_PREPARE_REQUIRED', '命令未声明 Prepare。');
    if (!preparing && declared.ui?.confirm && execution.confirmed !== true) throw fail('EXTENSION_CONFIRMATION_REQUIRED', '请先确认此操作。');
    const { validateInput } = require('./commandUi');
    let schema = declared.ui?.inputs || {};
    if (!preparing && declared.ui?.prepare) {
      const prepared = this.prepared.get(execution.prepareToken);
      if (!prepared || prepared.record !== record || prepared.commandId !== command.id) throw fail('EXTENSION_STALE_COMMAND', '准备数据已失效，请刷新或重新打开命令。');
      if (prepared.blocked) throw fail('EXTENSION_PREPARE_EMPTY', '没有可用的必填候选项，请刷新。');
      schema = prepared.ui.inputs;
    }
    const input = preparing ? {} : validateInput(schema, execution.input || {});
    let root;
    try { root = this.verify(id, record); }
    catch (error) {
      this.errors.set(id, error.message); this.notify();
      throw fail('EXTENSION_FILES_CHANGED', '扩展文件已变化或不可用，请重新导入包。');
    }
    const bytecodeCacheRoot = this.pythonCachePath(id, record);
    assertPlainPath(bytecodeCacheRoot);
    fs.mkdirSync(bytecodeCacheRoot, { recursive: true });
    if (!preparing && declared.ui?.prepare) this.prepared.delete(execution.prepareToken);
    const running = Promise.resolve().then(() => this.executePython({ root, entry, commandId: command.id, config, input, bytecodeCacheRoot,
      ...(viewing ? { phase: execution.phase, view: execution.viewRequest } : preparing ? { phase: 'prepare' } : {}) }));
    const active = this.active.get(id) || new Set(); active.add(running); this.active.set(id, active);
    try {
      const receipt = await running;
      const result = preparing || viewing ? null : require('./commandUi').parseUiResult(receipt?.result);
      if (result?.status === 'error') {
        const error = fail('EXTENSION_RESULT_ERROR', result.message); error.uiResult = result; throw error;
      }
      return receipt;
    } finally { active.delete(running); if (!active.size) this.active.delete(id); }
  }
}
module.exports = { ExtensionManager, CAPABILITY, commandId, assertPlainPath, inventory };
