const { randomUUID } = require('node:crypto');
const { parseView, parseActionResult, visibleItems, copyText } = require('./extensionView');
const { validateInput, initialValues } = require('./commandUi');

// Host owns pages and transient drafts; extensions supply bounded data and short-lived callbacks.
function createExtensionViewHost({ extensions, createWindow, hidePalette, clipboard, dialog, recordUsage = () => {} }) {
  const sessions = new Map();
  let serial = 0;
  const current = (s) => sessions.get(s.command.extensionId) === s && !s.window.isDestroyed();
  const page = (s) => s.pages.at(-1);
  const busy = (s) => ['loading', 'running'].includes(s.phase);
  const dirty = (p) => p?.view.type === 'form' && Object.keys(p.view.inputs).some((key) => (p.values[key] ?? '') !== (p.initial[key] ?? ''));
  const trusted = (event) => [...sessions.values()].find((s) => current(s)
    && event.sender === s.window.webContents && event.senderFrame === s.window.webContents.mainFrame);
  function snapshot(s) {
    const p = page(s);
    return { sessionId: s.id, serial: ++serial, version: s.version, extensionName: s.command.extensionName,
      phase: s.phase, error: s.error, message: s.message, summary: s.summary,
      confirmation: s.leave ? { kind: 'discard' } : s.confirmation ? { ...s.confirmation.action.confirm, kind: s.confirmation.kind } : null,
      depth: s.pages.length, view: p?.view || null, query: p?.query || '', filter: p?.filter || '', selectedId: p?.selectedId || null,
      multiSelect: p?.multiSelect || false, selectedIds: p?.selectedIds || [], values: p?.values || {}, dirty: dirty(p) };
  }
  function publish(s) { if (current(s)) s.window.webContents.send('extension-view:changed', snapshot(s)); }
  function newPage(view, itemId = null, itemIds = []) {
    const initial = view.type === 'form' ? initialValues(view.inputs) : {};
    return { view, query: '', filter: '', selectedId: view.items?.[0]?.id || null, selectedIds: [], multiSelect: false,
      itemId, itemIds, initial, values: { ...initial } };
  }
  function push(s, view, itemId = null, itemIds = []) {
    if (s.pages.length >= 8) throw new Error('视图导航最多 8 层，请先返回。');
    s.pages.push(newPage(view, itemId, itemIds)); s.version++;
  }
  function context(s, extra = {}) {
    const p = page(s);
    return { sessionId: s.id, revision: s.command.revision, version: s.version,
      viewId: p?.view.id || null, type: p?.view.type || 'list', itemId: p?.itemId || null, itemIds: p?.itemIds || [], ...extra };
  }
  async function work(s, task) {
    if (!current(s) || busy(s)) throw new Error('视图正在处理，请稍候。');
    s.error = null; s.message = ''; s.summary = null; s.phase = s.pages.length ? 'running' : 'loading'; publish(s);
    try {
      const result = await task();
      if (!current(s)) return;
      s.phase = 'ready'; publish(s); return result;
    } catch (error) {
      if (!current(s)) return;
      s.phase = page(s)?.view.type === 'form' ? 'ready' : 'error'; s.confirmation = null;
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
      const next = data.type === 'form' ? newPage(data, old.itemId, old.itemIds) : { ...old, view: data };
      if (next.filter && !data.items?.some((item) => item.tag === next.filter)) next.filter = '';
      const visible = visibleItems(next);
      next.selectedIds = (next.selectedIds || []).filter((id) => visible.some((item) => item.id === id));
      if (old.selectedId && !visible.some((item) => item.id === old.selectedId)) next.selectedId = null;
      if (next.selectedIds.length !== old.selectedIds.length || old.selectedId && !next.selectedId) s.message = 'selectionCleared';
      s.pages[s.pages.length - 1] = next; s.version++;
    }
  }
  const load = (s) => work(s, () => reload(s));
  function validate(s) {
    extensions.assertPrepareRecord(s.command.extensionId, s.record);
    if (extensions.mutating.has(s.command.extensionId) || !s.record.enabled) throw new Error('扩展已失效，请重新打开。');
  }
  function leave(s, next) {
    if (dirty(page(s))) { s.confirmation = null; s.leave = next; publish(s); return; }
    return next();
  }
  function back(s) {
    if (s.pages.length > 1) { s.pages.pop(); s.version++; s.phase = 'ready'; s.error = null; s.message = ''; s.summary = null; publish(s); }
    else if (page(s)?.view.type === 'form') s.window.close();
  }
  function confirm(s, a, kind, target) {
    if (!a.confirm) return true;
    if (!s.confirmation) { s.confirmation = { action: a, kind, target }; publish(s); return false; }
    if (s.confirmation.action !== a || s.confirmation.kind !== kind || s.confirmation.target !== target) throw new Error('操作确认已过期。');
    return true;
  }
  async function applyResult(s, result, { itemId, itemIds = [], submitting = false } = {}) {
    const p = page(s);
    s.summary = result.summary || null;
    s.message = result.message || '';
    if (submitting && result.effect !== 'keep') {
      p.initial = { ...p.values };
      if (s.pages.length > 1) { s.pages.pop(); s.version++; }
      if (result.effect === 'push') {
        s.pages[s.pages.length - 1] = newPage(parseView(result.view), itemId, itemIds); s.version++;
      } else if (result.effect !== 'close') await reload(s);
    }
    if (!current(s)) return;
    if (result.effect === 'close') { s.allowClose = true; s.window.close(); return; }
    if (!submitting && result.effect === 'push') push(s, parseView(result.view), itemId, itemIds);
    if (!submitting && result.effect === 'back') back(s);
    if (!submitting && result.effect === 'refresh') await reload(s);
    if (result.message) s.message = result.message;
    s.summary = result.summary || null;
  }
  async function action(s, request) {
    if (!request || typeof request !== 'object' || Object.keys(request).some((k) => !['id', 'scope', 'itemId', 'itemIds', 'version', 'confirmed'].includes(k))
      || typeof request.id !== 'string' || request.id.length > 80 || !['item', 'view', 'batch'].includes(request.scope)
      || request.version !== s.version || s.phase !== 'ready' || s.leave) throw new Error('操作已过期或视图未就绪。');
    validate(s);
    const p = page(s), item = request.scope === 'item' ? visibleItems(p).find((item) => item.id === p.selectedId) : null;
    if (request.scope === 'item' && (!item || request.itemId !== item.id || p.multiSelect)
      || request.scope !== 'item' && request.itemId != null) throw new Error('所选对象已变化。');
    const batch = request.scope === 'batch';
    if (batch && (!p.multiSelect || !p.selectedIds.length || JSON.stringify(request.itemIds) !== JSON.stringify(p.selectedIds))
      || !batch && request.itemIds?.length) throw new Error('所选对象已变化。');
    const selected = batch ? p.view.batchActions : request.scope === 'item' ? item?.actions : p.view.actions;
    const a = selected?.find((a) => a.id === request.id);
    if (!a) throw new Error('当前项不支持此操作。');
    if (dirty(p)) return leave(s, () => action(s, { ...request, version: s.version }));
    const target = JSON.stringify(batch ? p.selectedIds : item?.id || p.itemId);
    if (a.confirm) {
      if (request.confirmed !== true) {
        if (s.confirmation && s.confirmation.action !== a) throw new Error('请先确认或取消当前操作。');
        s.confirmation = { action: a, kind: 'action', target }; publish(s); return;
      }
      if (!s.confirmation) throw new Error('请先确认当前操作。');
      confirm(s, a, 'action', target);
    } else if (s.confirmation) throw new Error('请先确认或取消当前操作。');
    s.confirmation = null; s.message = '';
    const itemId = item?.id || p.itemId, itemIds = batch ? [...p.selectedIds] : p.itemIds;
    if (a.type === 'copy') { clipboard.writeText(a.text ?? copyText(p.view, item)); s.message = 'copied'; publish(s); }
    else if (a.type === 'detail') { push(s, parseView({ $clackly: 'view', version: 1, id: p.view.id, type: 'detail', ...item.detail }), item.id); publish(s); }
    else if (a.type === 'back') back(s);
    else if (a.type === 'refresh') await load(s);
    else await work(s, async () => {
      const result = parseActionResult(await extensions.requestView(s.command.id, s.command.revision, s.record,
        context(s, { actionId: a.id, itemId, itemIds, scope: request.scope })));
      if (!current(s)) return;
      if (batch && (!result.summary || result.summary.succeeded + result.summary.failed !== itemIds.length
        || result.summary.errors.some((e) => !itemIds.includes(e.id)))) throw new Error('批量结果与提交对象不一致，请检查源数据后刷新。');
      await applyResult(s, result, { itemId, itemIds });
    });
  }
  async function submit(s, request) {
    const p = page(s);
    if (s.phase !== 'ready' || s.leave || p?.view.type !== 'form' || request?.version !== s.version) throw new Error('表单已过期或正在保存。');
    validate(s);
    const values = validateInput(p.view.inputs, p.values), a = p.view.submit;
    if (a.confirm) {
      if (request.confirmed !== true) { s.confirmation = { action: a, kind: 'submit', target: JSON.stringify(values) }; publish(s); return; }
      if (!s.confirmation) throw new Error('请先确认保存。');
      confirm(s, a, 'submit', JSON.stringify(values));
    } else if (s.confirmation) throw new Error('请先完成当前确认。');
    s.confirmation = null;
    return work(s, async () => {
      const result = parseActionResult(await extensions.requestView(s.command.id, s.command.revision, s.record,
        context(s, { actionId: a.id, scope: 'form' }), values));
      if (current(s)) await applyResult(s, result, { itemId: p.itemId, itemIds: p.itemIds, submitting: true });
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
      pages: [], version: 0, phase: 'idle', message: '', error: null, summary: null, confirmation: null, leave: null };
    sessions.set(command.extensionId, s);
    s.window.on('close', (event) => {
      if (s.allowClose) return;
      if (page(s)?.view.type === 'form' && busy(s)) { event.preventDefault(); return; }
      if (dirty(page(s))) { event.preventDefault(); leave(s, () => s.window.close()); }
    });
    s.window.on('blur', () => { s.refocus = true; });
    s.window.on('focus', () => {
      if (!s.refocus) return;
      s.refocus = false;
      if (page(s)?.view.refreshOnFocus && s.phase === 'ready' && !s.confirmation && !s.leave) {
        try { validate(s); void load(s); } catch (error) { s.phase = 'error'; s.error = { message: error.message }; publish(s); }
      }
    });
    s.window.once('closed', () => { if (sessions.get(command.extensionId) === s) sessions.delete(command.extensionId); });
    s.window.once('ready-to-show', () => { if (current(s)) { publish(s); s.window.show(); s.window.focus(); } });
    hidePalette(); recordUsage(id); void load(s); return { view: true };
  }
  function registerIpc(ipcMain) {
    const get = (event) => { const s = trusted(event); if (!s) throw new Error('Extension View request rejected'); return s; };
    ipcMain.handle('extension-view:get', (event) => snapshot(get(event)));
    ipcMain.handle('extension-view:select', (event, request) => {
      const s = get(event), p = page(s);
      if (s.phase !== 'ready' || s.confirmation || s.leave || p?.view.type !== 'list' || !request
        || request.version !== s.version || typeof request.query !== 'string' || request.query.length > 200
        || typeof request.filter !== 'string' || request.filter.length > 80) throw new Error('列表状态已过期。');
      const next = { ...p, query: request.query, filter: request.filter }, items = visibleItems(next);
      const multiSelect = request.multiSelect ?? p.multiSelect, ids = request.selectedIds ?? p.selectedIds;
      if (typeof multiSelect !== 'boolean' || multiSelect && !p.view.batchActions?.length || !Array.isArray(ids)
        || ids.length > 100 || new Set(ids).size !== ids.length || ids.some((id) => !p.view.items.some((item) => item.id === id))) throw new Error('多选最多 100 个有效对象。');
      p.query = next.query; p.filter = next.filter; p.multiSelect = multiSelect;
      p.selectedIds = multiSelect ? ids.filter((id) => items.some((item) => item.id === id)) : [];
      if (multiSelect && p.selectedIds.length < ids.length) s.message = 'selectionCleared';
      p.selectedId = items.some((item) => item.id === request.selectedId) ? request.selectedId : items[0]?.id || null;
      publish(s);
    });
    ipcMain.handle('extension-view:draft', (event, request) => {
      const s = get(event), p = page(s), values = request?.values;
      if (s.phase !== 'ready' || s.confirmation || s.leave || p?.view.type !== 'form' || request.version !== s.version
        || !values || typeof values !== 'object' || Array.isArray(values) || JSON.stringify(values).length > 32768
        || Object.entries(values).some(([key, v]) => !Object.hasOwn(p.view.inputs, key)
          || !['string', 'number', 'boolean'].includes(typeof v) || typeof v === 'string' && v.length > 8192 || typeof v === 'number' && !Number.isFinite(v))) throw new Error('草稿输入无效或已过期。');
      p.values = { ...values }; publish(s);
    });
    ipcMain.handle('extension-view:submit', (event, request) => submit(get(event), request));
    ipcMain.handle('extension-view:pick', async (event, request) => {
      const s = get(event), p = page(s), type = p?.view.inputs?.[request?.key]?.type;
      if (s.phase !== 'ready' || s.confirmation || s.leave || p?.view.type !== 'form' || request.version !== s.version || !['path', 'folder'].includes(type)) throw new Error('文件选择请求已失效。');
      const result = await dialog.showOpenDialog(s.window, { properties: [type === 'folder' ? 'openDirectory' : 'openFile'] });
      return current(s) && page(s) === p && s.phase === 'ready' && !result.canceled ? result.filePaths[0] || null : null;
    });
    ipcMain.handle('extension-view:action', (event, request) => action(get(event), request));
    ipcMain.handle('extension-view:refresh', (event) => { const s = get(event); validate(s); if (s.confirmation || s.leave || busy(s)) return; return leave(s, () => load(s)); });
    ipcMain.handle('extension-view:back', (event) => {
      const s = get(event); if (s.confirmation || s.leave || busy(s)) return; return leave(s, () => back(s));
    });
    ipcMain.handle('extension-view:cancel-confirmation', (event) => { const s = get(event); s.confirmation = null; s.leave = null; publish(s); });
    ipcMain.handle('extension-view:discard', async (event) => {
      const s = get(event), next = s.leave;
      if (!next || busy(s)) throw new Error('没有待放弃的草稿。');
      s.leave = null; page(s).values = { ...page(s).initial }; s.version++; publish(s); return next();
    });
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
