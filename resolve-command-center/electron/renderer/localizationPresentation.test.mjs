import assert from "node:assert/strict";
import test from "node:test";
import { localizeCommands, localizeFeatureMetadata, presentError } from "../../localization/presentation.mjs";

test("localized Command metadata falls back per field and preserves English Search inputs", () => {
  const [command] = localizeCommands([{
    id: "vendor.command",
    name: "English command",
    description: "English description",
    category: "English category",
    keywords: ["english-keyword"],
    localizations: { "zh-CN": { name: "中文命令", keywords: ["中文关键词"] } }
  }], "zh-CN");
  assert.equal(command.name, "中文命令");
  assert.equal(command.description, "English description");
  assert.deepEqual(command.keywords, ["中文关键词"]);
  assert.equal(command.englishName, "English command");
  assert.deepEqual(command.englishKeywords, ["english-keyword"]);
});

test("feature/config display overlays stay presentation-only", () => {
  const feature = localizeFeatureMetadata({
    id: "vendor.feature", name: "English", description: "English description", category: "Test",
    configSchema: {
      mode: {
        type: "select",
        label: "Mode",
        options: ["fast", "safe"],
        optionLabels: { fast: "Fast", safe: "Safe" },
        localizations: { "zh-CN": { label: "模式", optionLabels: { fast: "快速" } } }
      }
    },
    localizations: { "zh-CN": { name: "中文功能", category: "测试" } }
  }, "zh-CN");
  assert.equal(feature.name, "中文功能");
  assert.equal(feature.description, "English description");
  assert.equal(feature.configSchema.mode.label, "模式");
  assert.equal(feature.configSchema.mode.optionLabels.fast, "快速");
  assert.equal(feature.configSchema.mode.optionLabels.safe, "Safe");
  assert.deepEqual(feature.configSchema.mode.options, ["fast", "safe"]);
});

test("structured runtime errors map through stable codes while unknown errors stay generic", () => {
  const t = (key) => ({
    "error.clipboard-image-not-found": "已本地化的剪贴板错误",
    "error.generic": "已本地化的通用错误"
  })[key];
  assert.equal(presentError({ code: "clipboard-image-not-found", message: "technical detail" }, t), "已本地化的剪贴板错误");
  assert.equal(presentError(new Error("technical detail"), t), "已本地化的通用错误");
});
