const { SchemaValidator } = require('../config/SchemaValidator');
const validator = new SchemaValidator();
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function invalid(message) { throw Object.assign(new Error(message), { code: 'EXTENSION_UI_INVALID' }); }
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid('扩展 UI 数据包含未知字段。');
}
function string(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || required && !value.trim()) invalid('扩展 UI 文本无效或过长。');
}
function validateInput(schema, values) {
  if (!object(values) || JSON.stringify(values).length > 32768) invalid('单次输入无效或过大。');
  const result = {};
  for (const key of Object.keys(values)) if (!Object.hasOwn(schema, key)) invalid('未知输入字段：' + key);
  for (const [key, field] of Object.entries(schema)) {
    const value = values[key];
    if (value === undefined || value === '' && field.type !== 'boolean') {
      if (field.required) invalid('请填写：' + field.label);
      continue;
    }
    const type = field.type === 'text' ? 'string' : field.type;
    try {
      if (type === 'select') {
        if (!field.options?.some((option) => (typeof option === 'string' ? option : option.value) === value)) throw new Error('Invalid option');
      } else validator.validateValues({ [key]: { ...field, type } }, { [key]: value });
    }
    catch { invalid('输入类型不正确：' + field.label); }
    if (typeof value === 'string' && (value.length > 8192 || field.required && !value.trim())) invalid('输入为空或过长：' + field.label);
    if (type === 'number' && (value < (field.min ?? -Infinity) || value > (field.max ?? Infinity))) invalid('数字超出范围：' + field.label);
    if (type === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) invalid('颜色必须为 #RRGGBB：' + field.label);
    result[key] = value;
  }
  return result;
}
function validateCommandUi(ui) {
  if (ui === undefined) return undefined;
  keys(ui, ['version', 'inputs', 'confirm', 'prepare']);
  if (ui.version !== 1 && ui.version !== 2 || ui.version === 2 && ui.prepare !== true
    || ui.version === 1 && ui.prepare !== undefined) invalid('不支持的 Command UI 版本或 Prepare 声明。');
  const inputs = ui.inputs ?? {};
  if (!object(inputs) || Object.keys(inputs).length > 20) invalid('单次输入最多 20 个字段。');
  for (const [key, field] of Object.entries(inputs)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key) || ['constructor', 'prototype'].includes(key)) invalid('输入字段名称无效。');
    keys(field, ['type', 'label', 'description', 'placeholder', 'default', 'required', 'min', 'max', 'options', 'dynamic']);
    string(field.label, 120, true);
    if (field.dynamic !== undefined && (ui.version !== 2 || field.dynamic !== true || field.type !== 'select'
      || field.options !== undefined || field.default !== undefined)) invalid('动态选项仅用于 Prepare select，不能声明静态选项或默认值。');
    validator.validateSchema({ [key]: { ...field, type: field.type === 'text' ? 'string' : field.type,
      ...(field.dynamic ? { options: ['validated-at-prepare'] } : {}) } });
    for (const name of ['description', 'placeholder']) if (field[name] !== undefined) string(field[name], 2000);
    if (field.options && (field.options.length > 100 || field.options.some((value) => value.length > 200)
      || new Set(field.options).size !== field.options.length)) invalid('静态选项无效或过多。');
    for (const name of ['min', 'max']) if (field[name] !== undefined && (field.type !== 'number' || !Number.isFinite(field[name]))) invalid('数字范围无效。');
    if (field.min > field.max) invalid('数字范围倒置。');
    if (field.default !== undefined) validateInput({ [key]: field }, { [key]: field.default });
  }
  if (ui.confirm !== undefined) { keys(ui.confirm, ['message']); string(ui.confirm.message, 2000, true); }
  if (!Object.keys(inputs).length && !ui.confirm) invalid('Command UI 必须声明输入或确认。');
  return structuredClone({ version: ui.version, inputs, ...(ui.prepare ? { prepare: true } : {}), ...(ui.confirm ? { confirm: ui.confirm } : {}) });
}

// Prepare supplies data for a fixed manifest; it can never supply schema or UI code.
function applyPrepare(ui, value) {
  keys(value, ['$clackly', 'version', 'options', 'defaults', 'message']);
  if (value.$clackly !== 'prepare' || value.version !== 1 || JSON.stringify(value).length > 65536) invalid('Prepare 返回版本或大小无效。');
  const options = value.options ?? {}, defaults = value.defaults ?? {};
  if (!object(options) || !object(defaults)) invalid('Prepare 选项与默认值必须是对象。');
  if (value.message !== undefined) string(value.message, 2000);
  const inputs = structuredClone(ui.inputs);
  for (const [key, items] of Object.entries(options)) {
    if (!Object.hasOwn(inputs, key) || !inputs[key].dynamic) invalid('Prepare 返回未声明的动态字段：' + key);
    if (!Array.isArray(items) || items.length > 100) invalid('Prepare 候选项过多或无效。');
    const seen = new Set();
    for (const item of items) {
      keys(item, ['label', 'value']); string(item.label, 200, true); string(item.value, 200, true);
      if (seen.has(item.value)) invalid('Prepare 候选值重复。');
      seen.add(item.value);
    }
    inputs[key].options = items;
  }
  for (const [key, field] of Object.entries(inputs)) {
    if (field.dynamic && !Object.hasOwn(options, key)) invalid('Prepare 缺少动态选项：' + key);
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!Object.hasOwn(inputs, key) || value === null || value === undefined || value === '') invalid('Prepare 默认值无效：' + key);
    validateInput({ [key]: inputs[key] }, { [key]: value });
    inputs[key].default = value;
  }
  const dynamic = Object.values(inputs).filter((field) => field.dynamic);
  const blocked = dynamic.some((field) => field.required && !field.options.length);
  return { ui: { ...structuredClone(ui), inputs }, message: value.message || '', blocked,
    empty: blocked || dynamic.length > 0 && dynamic.every((field) => !field.options.length) };
}
function initialValues(inputs) {
  return Object.fromEntries(Object.entries(inputs).filter(([, field]) => field.default !== undefined || ['boolean', 'color'].includes(field.type))
    .map(([key, field]) => [key, field.default ?? (field.type === 'color' ? '#101216' : false)]));
}
function refreshValues(inputs, previous = {}, edited = []) {
  if (!object(previous) || JSON.stringify(previous).length > 32768 || !Array.isArray(edited)
    || edited.length > 20 || edited.some((key) => !Object.hasOwn(inputs, key))) invalid('刷新输入无效。');
  const values = initialValues(inputs), cleared = [];
  for (const key of edited) {
    const field = inputs[key], value = previous[key];
    try {
      const valid = validateInput({ [key]: { ...field, required: false } }, value === undefined ? {} : { [key]: value });
      if (Object.hasOwn(valid, key)) values[key] = valid[key]; else delete values[key];
    } catch { delete values[key]; cleared.push(field.label); }
  }
  // Never silently switch an existing selection to a new Prepare default.
  for (const [key, field] of Object.entries(inputs)) if (field.dynamic && previous[key] !== undefined) {
    try { validateInput({ [key]: field }, { [key]: previous[key] }); values[key] = previous[key]; }
    catch { delete values[key]; if (!cleared.includes(field.label)) cleared.push(field.label); }
  }
  return { values, cleared };
}
function parseUiResult(value) {
  if (!object(value) || value.$clackly !== 'result') return null;
  keys(value, ['$clackly', 'version', 'status', 'message', 'text', 'fields', 'items', 'diagnostic']);
  if (value.version !== 1 || !['success', 'error'].includes(value.status) || JSON.stringify(value).length > 65536) invalid('扩展结果版本、状态或大小无效。');
  string(value.message, 2000, true);
  for (const name of ['text', 'diagnostic']) if (value[name] !== undefined) string(value[name], 32768);
  if (value.items !== undefined) {
    if (!Array.isArray(value.items) || value.items.length > 100) invalid('结果列表过大。');
    value.items.forEach((item) => string(item, 2000));
  }
  if (value.fields !== undefined) {
    if (!Array.isArray(value.fields) || value.fields.length > 50) invalid('结果字段过多。');
    value.fields.forEach((item) => { keys(item, ['label', 'value']); string(item.label, 120, true); string(item.value, 2000); });
  }
  return structuredClone(value);
}
module.exports = { validateCommandUi, validateInput, parseUiResult, applyPrepare, initialValues, refreshValues };
