const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeText, transliterate } = require("./transliteration.mjs");

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
