const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeText, transliterate, transliterateName } = require("./transliteration.mjs");

test("transliteration produces Clackly-owned compact pinyin and initials", () => {
  assert.deepEqual(transliterate("导出时间线"), {
    full: "daochushijianxian",
    initials: "dcsjx"
  });
  assert.deepEqual(transliterate("导出到 After Effects"), {
    full: "daochudaoaftereffects",
    initials: "dcdae"
  });
});

test("transliteration is defensive for empty and non-Chinese values", () => {
  assert.deepEqual(transliterate("After Effects"), { full: "aftereffects", initials: "ae" });
  assert.deepEqual(transliterate(""), { full: "", initials: "" });
  assert.deepEqual(transliterate(null), { full: "", initials: "" });
  assert.equal(normalizeText("  ＡＦＴＥＲ   Effects  "), "after effects");
});

test("name transliteration adds bounded one-syllable polyphonic alternatives", () => {
  assert.deepEqual(transliterateName("粘贴剪贴板图像"), {
    full: ["niantiejiantiebantuxiang", "zhantiejiantiebantuxiang"],
    initials: ["ntjtbtx", "ztjtbtx"]
  });
  assert.deepEqual(transliterateName("After Effects"), {
    full: ["aftereffects"],
    initials: ["ae"]
  });
  assert.deepEqual(transliterateName(""), { full: [], initials: [] });
  assert.deepEqual(transliterateName(null), { full: [], initials: [] });
});

test("name polyphonic alternatives never form a Cartesian product", () => {
  const result = transliterateName("重行");
  assert.deepEqual(result.full, ["zhongxing", "chongxing", "zhonghang", "zhongheng"]);
  assert.equal(result.full.includes("chonghang"), false);
  assert.equal(result.initials.includes("ch"), false);
});
