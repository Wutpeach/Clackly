const { validateCommandUi } = require('./commandUi');
// Extension Views accept bounded data only. No URLs, markup, callbacks or native commands.
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function invalid() { throw Object.assign(new Error('扩展视图数据无效、包含未知字段或超出限制。'), { code: 'EXTENSION_VIEW_INVALID' }); }
function keys(value, allowed) { if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid(); }
function text(value, max = 2000, required = false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) invalid();
}
function optional(value, key, max) { if (value[key] !== undefined) text(value[key], max); }
function actions(value = []) {
  if (!Array.isArray(value) || value.length > 8) invalid();
  const ids = new Set();
  for (const action of value) {
    keys(action, ['id', 'title', 'type', 'text', 'confirm', 'dangerous']);
    text(action.id, 80, true); text(action.title, 120, true);
    if (ids.has(action.id) || !['copy', 'detail', 'refresh', 'back', 'extension'].includes(action.type)) invalid();
    ids.add(action.id);
    optional(action, 'text', 8192);
    if (action.text !== undefined && action.type !== 'copy') invalid();
    if (action.dangerous !== undefined && (typeof action.dangerous !== 'boolean' || action.type !== 'extension')) invalid();
    if (action.dangerous && !action.confirm) invalid();
    if (action.confirm !== undefined) {
      if (action.type !== 'extension') invalid();
      keys(action.confirm, ['message']); text(action.confirm.message, 2000, true);
    }
  }
  return value;
}
function detail(value) {
  keys(value, ['title', 'text', 'fields', 'actions']); text(value.title, 200, true); optional(value, 'text', 32768);
  if (value.fields !== undefined) {
    if (!Array.isArray(value.fields) || value.fields.length > 50) invalid();
    for (const field of value.fields) { keys(field, ['label', 'value']); text(field.label, 120, true); text(field.value, 2000); }
  }
  actions(value.actions);
  if ((value.actions || []).some((a) => a.type === 'detail')) invalid();
}
function parseView(value) {
  keys(value, ['$clackly', 'version', 'id', 'type', 'title', 'subtitle', 'items', 'text', 'fields', 'actions', 'emptyMessage', 'batchActions', 'refreshOnFocus', 'inputs', 'submit']);
  if (value.$clackly !== 'view' || value.version !== 1 || !['list', 'detail', 'form'].includes(value.type)
    || JSON.stringify(value).length > 524288) invalid();
  text(value.id, 120, true); text(value.title, 200, true); optional(value, 'subtitle', 2000); actions(value.actions);
  if (value.refreshOnFocus !== undefined && (typeof value.refreshOnFocus !== 'boolean' || value.type === 'form')) invalid();
  if ((value.type !== 'list' && value.batchActions !== undefined) || (value.type !== 'form' && (value.inputs !== undefined || value.submit !== undefined))) invalid();
  if (value.type === 'list') {
    actions(value.batchActions);
    if (value.batchActions?.some((a) => a.type !== 'extension')) invalid();
    if (value.text !== undefined || value.fields !== undefined || !Array.isArray(value.items) || value.items.length > 500) invalid();
    optional(value, 'emptyMessage', 2000);
    const ids = new Set();
    for (const item of value.items) {
      keys(item, ['id', 'title', 'subtitle', 'tag', 'detail', 'actions']);
      text(item.id, 512, true); text(item.title, 200, true); optional(item, 'subtitle', 500); optional(item, 'tag', 80);
      if (ids.has(item.id)) invalid(); ids.add(item.id); actions(item.actions);
      if (item.detail !== undefined) detail(item.detail);
      if ((item.actions || []).some((a) => a.type === 'detail') && !item.detail) invalid();
    }
    if ((value.actions || []).some((a) => a.type === 'detail')) invalid();
  } else if (value.type === 'detail') {
    if (value.items !== undefined || value.emptyMessage !== undefined) invalid();
    detail({ title: value.title, ...(value.text === undefined ? {} : { text: value.text }),
      ...(value.fields === undefined ? {} : { fields: value.fields }), actions: value.actions || [] });
  } else {
    if (value.items !== undefined || value.emptyMessage !== undefined || value.text !== undefined || value.fields !== undefined) invalid();
    validateCommandUi({ version: 1, inputs: value.inputs });
    keys(value.submit, ['id', 'title', 'confirm', 'dangerous']);
    actions([{ ...value.submit, type: 'extension' }]);
    if (value.actions?.some((a) => a.type === 'detail')) invalid();
  }
  return structuredClone(value);
}
function parseActionResult(value) {
  keys(value, ['$clackly', 'version', 'effect', 'message', 'view', 'summary']);
  if (value.$clackly !== 'view-action' || value.version !== 1 || !['keep', 'refresh', 'push', 'back', 'close'].includes(value.effect)
    || JSON.stringify(value).length > 524288) invalid();
  optional(value, 'message', 2000);
  if (value.effect === 'push') parseView(value.view); else if (value.view !== undefined) invalid();
  if (value.summary !== undefined) {
    const s = value.summary; keys(s, ['succeeded', 'failed', 'errors']);
    if (![s.succeeded, s.failed].every((n) => Number.isInteger(n) && n >= 0) || s.succeeded + s.failed > 100
      || !Array.isArray(s.errors) || s.errors.length !== s.failed) invalid();
    const ids = new Set();
    for (const error of s.errors) { keys(error, ['id', 'message']); text(error.id, 512, true); text(error.message, 2000, true); if (ids.has(error.id)) invalid(); ids.add(error.id); }
  }
  return structuredClone(value);
}
function visibleItems(page) {
  const query = page.query.trim().toLocaleLowerCase();
  return (page.view.items || []).filter((item) => (!page.filter || item.tag === page.filter)
    && (!query || [item.title, item.subtitle, item.tag].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
}
function copyText(view, item) {
  const source = item?.detail || item || view;
  return [source.title, source.subtitle, source.text, ...(source.fields || []).map((f) => f.label + ': ' + f.value)].filter(Boolean).join('\n');
}
module.exports = { parseView, parseActionResult, visibleItems, copyText };
