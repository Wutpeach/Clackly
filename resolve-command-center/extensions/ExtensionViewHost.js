const { randomUUID } = require('node:crypto');
const { parseView, parseActionResult, visibleItems, copyText } = require('./extensionView');

// One ordinary window per extension. Renderer identities are checked against Host-owned pages.
function createExtensionViewHost({ extensions, createWindow, hidePalette, clipboard, recordUsage = () => {} }) {
  const sessions = new Map();
  let serial = 0;
  const current = (s) => sessions.get(s.command.extensionId) === s && !s.window.isDestroyed();
  const page = (s) => s.pages.at(-1);
  const trusted = (event) => [...sessions.values()].find((s) => current(s)
    && event.sender === s.window.webContents && event.senderFrame === s.window.webContents.mainFrame);
  function snapshot(s) {
    const p = page(s);
    return { sessionId: s.id, serial: ++serial, version: s.version, extensionName: s.command.extensionName,
      phase: s.phase, error: s.error, message: s.message, confirmation: s.confirmation?.action.confirm || null,
      depth: s.pages.length, view: p?.view || null, query: p?.query || '', filter: p?.filter || '', selectedId: p?.selectedId || null };
  }
  function publish(s) { if (current(s)) s.window.webContents.send('extension-view:changed', snapshot(s)); }
  function push(s, view, itemId = null) {
    if (s.pages.length >= 8) throw new Error('视图导航最多 8 层，请先返回。');
    s.pages.push({ view, query: '', filter: '', selectedId: view.items?.[0]?.id || null, itemId }); s.version++;
  }
  function context(s, extra = {}) {
    const p = page(s);
    return { sessionId: s.id, revision: s.command.revision, version: s.version,
      viewId: p?.view.id || null, type: p?.view.type || 'list', itemId: p?.itemId || null, ...extra };
  }
  async function work(s, task) {
    if (!current(s) || s.phase === 'loading' || s.phase === 'running') throw new Error('视图正在处理，请稍候。');
    s.error = null; s.message = ''; s.phase = s.pages.length ? 'running' : 'loading'; publish(s);
    try {
      const result = await task();
      if (!current(s)) return;
      s.phase = 'ready'; publish(s); return result;
    } catch (error) {
      if (!current(s)) return;
      s.phase = 'error'; s.confirmation = null;
      s.error = { message: error.userMessage || error.message, code: error.code || '',
        timeout: /timeout|timed.out/i.test(String(error.code) + ' ' + error.message) }; publish(s);
    }
  }
  async function reload(s) {
      const data = parseView(await extensions.requestView(s.command.id, s.command.revision, s.record, context(s)));
      if (!current(s)) return;
      const old = page(s);
      if (!old) push(s, data);
      else {
        const next = { ...old, view: data };
        if (next.filter && !data.items?.some((item) => item.tag === next.filter)) next.filter = '';
        if (old.selectedId && !visibleItems(next).some((item) => item.id === old.selectedId)) {
          next.selectedId = null; s.message = 'selectionCleared';
        }
        s.pages[s.pages.length - 1] = next; s.version++;
      }
  }
  async function load(s) {
    return work(s, () => reload(s));
  }
  function validate(s) {
    extensions.assertPrepareRecord(s.command.extensionId, s.record);
    if (extensions.mutating.has(s.command.extensionId) || !s.record.enabled) throw new Error('扩展已失效，请重新打开。');
  }
  function back(s) {
    if (s.pages.length > 1) { s.pages.pop(); s.version++; s.phase = 'ready'; s.error = null; s.message = ''; publish(s); }
  }
  async function action(s, request) {
    if (!request || typeof request !== 'object' || Object.keys(request).some((k) => !['id', 'scope', 'itemId', 'version', 'confirmed'].includes(k))
      || typeof request.id !== 'string' || request.id.length > 80 || !['item', 'view'].includes(request.scope)
      || request.version !== s.version || s.phase !== 'ready') throw new Error('操作已过期或视图未就绪。');
    validate(s);
    const p = page(s), item = request.scope === 'item' ? visibleItems(p).find((item) => item.id === p.selectedId) : null;
    if (request.scope === 'item' && (!item || request.itemId !== item.id) || request.scope === 'view' && request.itemId != null) throw new Error('所选对象已变化。');
    const selected = request.scope === 'item' ? item?.actions : p.view.actions;
    const a = selected?.find((a) => a.id === request.id);
    if (!a) throw new Error('当前项不支持此操作。');
    if (s.confirmation && s.confirmation.action !== a) throw new Error('请先确认或取消当前操作。');
    if (a.confirm) {
      if (request.confirmed !== true) { s.confirmation = { action: a, itemId: item?.id, request }; publish(s); return; }
      if (s.confirmation?.action !== a || s.confirmation.itemId !== item?.id) throw new Error('请先确认当前操作。');
    }
    s.confirmation = null; s.message = '';
    if (a.type === 'copy') { clipboard.writeText(a.text ?? copyText(p.view, item)); s.message = 'copied'; publish(s); }
    else if (a.type === 'detail') {
      push(s, parseView({ $clackly: 'view', version: 1, id: p.view.id, type: 'detail', ...item.detail }), item.id); publish(s);
    } else if (a.type === 'back') back(s);
    else if (a.type === 'refresh') await load(s);
    else await work(s, async () => {
      const result = parseActionResult(await extensions.requestView(s.command.id, s.command.revision, s.record,
        context(s, { actionId: a.id, itemId: item?.id || p.itemId, scope: request.scope })));
      if (!current(s)) return;
      if (result.effect === 'close') { s.window.close(); return; }
      if (result.effect === 'push') push(s, parseView(result.view), result.view.type === 'detail' ? item?.id || p.itemId : null);
      if (result.effect === 'back') back(s);
      if (result.effect === 'refresh') await reload(s);
      if (result.message) s.message = result.message;
    });
  }
  const unsubscribe = extensions.subscribe(() => {
    for (const s of sessions.values()) {
      if (extensions.state[s.command.extensionId] !== s.record || extensions.mutating.has(s.command.extensionId)
        || extensions.errors.has(s.command.extensionId)) s.window.destroy();
    }
  });
  async function start(id) {
    const command = extensions.describeCommand(id);
    if (!command?.view) return false;
    const existing = sessions.get(command.extensionId);
    if (existing && current(existing)) {
      validate(existing); if (existing.window.isMinimized()) existing.window.restore();
      existing.window.show(); existing.window.focus(); hidePalette(); recordUsage(id); return { view: true };
    }
    if (sessions.size >= 8) throw new Error('最多同时打开 8 个扩展窗口，请先关闭一个。');
    const record = extensions.get(command.extensionId);
    extensions.assertPrepareRecord(command.extensionId, record);
    if (!record.enabled || extensions.mutating.has(command.extensionId) || extensions.errors.has(command.extensionId)) throw new Error('扩展不可用。');
    const s = { id: randomUUID(), command, record, window: createWindow(command.extensionId, command.extensionName),
      pages: [], version: 0, phase: 'idle', message: '', error: null, confirmation: null };
    sessions.set(command.extensionId, s);
    s.window.once('closed', () => { if (sessions.get(command.extensionId) === s) sessions.delete(command.extensionId); });
    s.window.once('ready-to-show', () => { if (current(s)) { publish(s); s.window.show(); s.window.focus(); } });
    hidePalette(); recordUsage(id); void load(s); return { view: true };
  }
  function registerIpc(ipcMain) {
    const get = (event) => { const s = trusted(event); if (!s) throw new Error('Extension View request rejected'); return s; };
    ipcMain.handle('extension-view:get', (event) => snapshot(get(event)));
    ipcMain.handle('extension-view:select', (event, request) => {
      const s = get(event), p = page(s);
      if (s.phase !== 'ready' || s.confirmation || p?.view.type !== 'list' || !request
        || request.version !== s.version || typeof request.query !== 'string' || request.query.length > 200
        || typeof request.filter !== 'string' || request.filter.length > 80) throw new Error('列表状态已过期。');
      p.query = request.query; p.filter = request.filter;
      const items = visibleItems(p);
      p.selectedId = items.some((item) => item.id === request.selectedId) ? request.selectedId : items[0]?.id || null;
      publish(s);
    });
    ipcMain.handle('extension-view:action', (event, request) => action(get(event), request));
    ipcMain.handle('extension-view:refresh', (event) => { const s = get(event); validate(s); if (s.confirmation) return; return load(s); });
    ipcMain.handle('extension-view:back', (event) => {
      const s = get(event); if (s.confirmation || ['loading', 'running'].includes(s.phase)) return; back(s);
    });
    ipcMain.handle('extension-view:cancel-confirmation', (event) => { const s = get(event); s.confirmation = null; publish(s); });
    ipcMain.on('extension-view:window', (event, operation) => {
      const s = trusted(event); if (!s) return;
      if (operation === 'close') s.window.close();
      if (operation === 'minimize') s.window.minimize();
      if (operation === 'maximize') { if (s.window.isMaximized()) s.window.unmaximize(); else s.window.maximize(); }
    });
  }
  return { start, registerIpc, dispose() { unsubscribe(); for (const s of sessions.values()) s.window.destroy(); sessions.clear(); } };
}
module.exports = { createExtensionViewHost };
