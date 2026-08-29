const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CommandSearchService,
  RELEVANCE,
  THIRTY_DAYS_MS,
  decayedUsageScore,
  normalizePinnedIds,
  textRelevance
} = require("./CommandSearchService.mjs");

function command(overrides = {}) {
  return {
    id: "timeline.exportToAfterEffects",
    name: "Export to After Effects",
    description: "Export the selected timeline range.",
    category: "Export",
    icon: "send",
    keywords: ["after effects", "export", "timeline"],
    capability: "ae.export",
    presentation: "visible",
    localizations: {
      "zh-CN": {
        name: "导出到 After Effects",
        description: "导出时间线",
        category: "导出",
        keywords: ["导出", "导出时间线", "时间线"]
      }
    },
    ...overrides
  };
}

function createService({ commands = [command()], locale = "zh-CN", usage = {}, now = 1_800_000_000_000 } = {}) {
  let effectiveLocale = locale;
  let usageSnapshot = usage;
  const service = new CommandSearchService({
    getCommands: () => structuredClone(commands),
    localizationService: { getSnapshot: () => ({ effectiveLocale }) },
    usageHistory: { getSnapshot: () => structuredClone(usageSnapshot) },
    now: () => now
  });
  return {
    service,
    setLocale(next) { effectiveLocale = next; },
    setUsage(next) { usageSnapshot = next; }
  };
}

function ids(response) {
  return response.commands.map(({ id }) => id);
}

test("Search projects localized metadata with English fallback, generated pinyin, ids, and bounded substring matching", () => {
  const hidden = command({ id: "timeline.hidden", presentation: "internal" });
  const { service } = createService({ commands: [command(), hidden] });

  for (const query of ["导出", "dao", "daochu", "dcsjx", "Export to After Effects", "after effects", "export", "timeline", "timeline.export"]) {
    assert.deepEqual(ids(service.search(query, [])), ["timeline.exportToAfterEffects"], query);
  }
  assert.deepEqual(ids(service.search("fect", [])), ["timeline.exportToAfterEffects"], "substring fallback remains bounded to Search fields");
  assert.deepEqual(ids(service.search("dao timeline", [])), ["timeline.exportToAfterEffects"], "every multi-token query token must match");
  assert.deepEqual(ids(service.search("missing dao", [])), []);
  assert.deepEqual(ids(service.search("", [])), ["timeline.exportToAfterEffects"], "internal Commands never appear");

  const result = service.search("导出", []);
  assert.equal(Object.hasOwn(result.commands[0], "pinyin"), false, "generated pinyin never crosses the Search boundary");
  result.commands[0].keywords.push("changed");
  assert.deepEqual(service.search("导出", []).commands[0].keywords, ["导出", "导出时间线", "时间线"]);
});

test("Search replaces its one-locale projection instead of retaining stale localized terms", () => {
  const { service, setLocale } = createService({ locale: "en" });
  assert.deepEqual(ids(service.search("导出", [])), []);
  setLocale("zh-CN");
  assert.deepEqual(ids(service.search("导出", [])), ["timeline.exportToAfterEffects"]);
  setLocale("en");
  assert.deepEqual(ids(service.search("导出", [])), []);
  assert.deepEqual(ids(service.search("export", [])), ["timeline.exportToAfterEffects"]);
});

test("nonempty Search uses complete relevance before pin and usage tie breakers", () => {
  const strong = command({ id: "strong", localizations: { "zh-CN": { name: "导出", keywords: [] } } });
  const weak = command({
    id: "weak",
    name: "Weak",
    keywords: ["other"],
    localizations: { "zh-CN": { name: "其他", keywords: ["导出时间线"] } }
  });
  const { service } = createService({
    commands: [strong, weak],
    usage: { weak: { usageCount: 1_000, lastUsedAt: 1_800_000_000_000 } }
  });
  assert.deepEqual(ids(service.search("导出", ["weak"])), ["strong", "weak"], "a strong localized-name match cannot be crossed");

  const equalA = command({ id: "equal-a", localizations: { "zh-CN": { name: "导出A", keywords: [] } } });
  const equalB = command({ id: "equal-b", localizations: { "zh-CN": { name: "导出B", keywords: [] } } });
  const sameTier = createService({
    commands: [equalA, equalB],
    usage: { "equal-b": { usageCount: 3, lastUsedAt: 1_800_000_000_000 } }
  }).service;
  assert.deepEqual(ids(sameTier.search("导", [])), ["equal-b", "equal-a"], "usage breaks only equal text tuples");
  assert.deepEqual(ids(sameTier.search("导", ["equal-a"])), ["equal-a", "equal-b"], "Pin is only a same-tuple tie breaker");
});

test("text exactness remains a relevance boundary before Pin and usage", () => {
  const exact = command({
    id: "exact",
    localizations: { "zh-CN": { name: "导出", keywords: [] } }
  });
  const prefix = command({
    id: "prefix",
    localizations: { "zh-CN": { name: "导出时间线", keywords: [] } }
  });
  const { service } = createService({
    commands: [prefix, exact],
    usage: { prefix: { usageCount: 1_000, lastUsedAt: 1_800_000_000_000 } }
  });

  assert.deepEqual(
    ids(service.search("导出", ["prefix"])),
    ["exact", "prefix"],
    "an exact localized-name match cannot be crossed by a pinned, high-usage prefix match"
  );
});

test("empty Search orders Pin then decayed usage facts then deterministic source order", () => {
  const pinned = command({ id: "pinned" });
  const oldFrequent = command({ id: "old-frequent" });
  const recent = command({ id: "recent" });
  const unused = command({ id: "unused" });
  const now = 1_800_000_000_000;
  const { service } = createService({
    commands: [unused, oldFrequent, recent, pinned],
    now,
    usage: {
      "old-frequent": { usageCount: 1_000, lastUsedAt: now - 4 * THIRTY_DAYS_MS },
      recent: { usageCount: 5, lastUsedAt: now }
    }
  });
  assert.deepEqual(ids(service.search("", ["pinned"])), ["pinned", "recent", "old-frequent", "unused"]);
  assert.deepEqual(service.search("", []).usedCommandIds, ["recent", "old-frequent"]);
  assert.ok(
    decayedUsageScore({ usageCount: 5, lastUsedAt: now }, now)
      > decayedUsageScore({ usageCount: 1_000, lastUsedAt: now - 4 * THIRTY_DAYS_MS }, now),
    "long-unused frequency decays behind meaningful current use"
  );
});

test("Search validates Pin request facts and exposes explicit relevance tuples", () => {
  const { service } = createService();
  assert.throws(() => service.search("", "timeline.exportToAfterEffects"), /pinnedIds/);
  assert.throws(() => normalizePinnedIds(["duplicate", "duplicate"]), /unique/);
  assert.throws(() => normalizePinnedIds([""]), /non-empty/);
  assert.deepEqual(ids(service.search(null, [])), ["timeline.exportToAfterEffects"]);

  const projection = service.getProjection().entries[0];
  const match = textRelevance(projection, "导出");
  assert.equal(match.wholeQuery, RELEVANCE.LOCALIZED_NAME_PREFIX);
});
