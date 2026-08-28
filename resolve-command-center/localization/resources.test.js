const assert = require("node:assert/strict");
const test = require("node:test");
const { translate } = require("./resources");

test("translation falls back field-by-field to English and never exposes resource keys", () => {
  assert.equal(translate("zh-CN", "palette.search"), "搜索命令");
  assert.equal(translate("zh-CN", "native.hotkey.message", { accelerator: "Ctrl+K" }), "Clackly 无法注册 Ctrl+K。");
  assert.equal(translate("zh-CN", "missing.key"), "Unavailable");
  assert.equal(translate("unsupported", "palette.search"), "Search commands");
});

test("lifecycle warning sentences and compact labels remain distinct in both locales", () => {
  assert.equal(translate("en", "status.warning.unavailable"), "Feature is unavailable.");
  assert.equal(translate("en", "status.label.unavailable"), "Unavailable");
  assert.equal(translate("zh-CN", "status.warning.unavailable"), "功能不可用。");
  assert.equal(translate("zh-CN", "status.label.unavailable"), "不可用");
});

test("CommonJS resource entry re-exports the shared ESM authority", async () => {
  const commonJs = require("./resources");
  const esm = await import("./resources.mjs");
  assert.equal(commonJs.resources, esm.resources);
  assert.equal(commonJs.translate, esm.translate);
});
