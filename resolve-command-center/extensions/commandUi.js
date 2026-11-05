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
    try { validator.validateValues({ [key]: { ...field, type } }, { [key]: value }); }
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
  keys(ui, ['version', 'inputs', 'confirm']);
  if (ui.version !== 1) invalid('不支持的 Command UI 版本。');
  const inputs = ui.inputs ?? {};
  if (!object(inputs) || Object.keys(inputs).length > 20) invalid('单次输入最多 20 个字段。');
  for (const [key, field] of Object.entries(inputs)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key) || ['constructor', 'prototype'].includes(key)) invalid('输入字段名称无效。');
    keys(field, ['type', 'label', 'description', 'placeholder', 'default', 'required', 'min', 'max', 'options']);
    string(field.label, 120, true);
    validator.validateSchema({ [key]: { ...field, type: field.type === 'text' ? 'string' : field.type } });
    for (const name of ['description', 'placeholder']) if (field[name] !== undefined) string(field[name], 2000);
    if (field.options && (field.options.length > 100 || field.options.some((value) => value.length > 200)
      || new Set(field.options).size !== field.options.length)) invalid('静态选项无效或过多。');
    for (const name of ['min', 'max']) if (field[name] !== undefined && (field.type !== 'number' || !Number.isFinite(field[name]))) invalid('数字范围无效。');
    if (field.min > field.max) invalid('数字范围倒置。');
    if (field.default !== undefined) validateInput({ [key]: field }, { [key]: field.default });
  }
  if (ui.confirm !== undefined) { keys(ui.confirm, ['message']); string(ui.confirm.message, 2000, true); }
  if (!Object.keys(inputs).length && !ui.confirm) invalid('Command UI 必须声明输入或确认。');
  return structuredClone({ version: 1, inputs, ...(ui.confirm ? { confirm: ui.confirm } : {}) });
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
module.exports = { validateCommandUi, validateInput, parseUiResult };
