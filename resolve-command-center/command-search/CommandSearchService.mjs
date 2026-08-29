import { isCommandPresentable } from "../command-engine/presentation.mjs";
import { localizeMetadata } from "../localization/metadata.mjs";
import { normalizeText, transliterate } from "./transliteration.mjs";

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const RELEVANCE = Object.freeze({
  LOCALIZED_NAME_EXACT: 1,
  LOCALIZED_NAME_PREFIX: 2,
  ENGLISH_NAME_EXACT: 3,
  ENGLISH_NAME_PREFIX: 4,
  LOCALIZED_KEYWORD_EXACT: 5,
  LOCALIZED_KEYWORD_PREFIX: 6,
  ENGLISH_KEYWORD_EXACT: 7,
  ENGLISH_KEYWORD_PREFIX: 8,
  COMMAND_ID_EXACT: 9,
  COMMAND_ID_PREFIX: 9,
  FULL_PINYIN_EXACT: 10,
  FULL_PINYIN_PREFIX: 10,
  PINYIN_INITIALS_EXACT: 11,
  PINYIN_INITIALS_PREFIX: 11,
  SUBSTRING: 12
});

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function createSearchField(value) {
  const normalized = normalizeText(value);
  return normalized ? { normalized, compact: normalized.replace(/\s+/g, "") } : null;
}

function createProjectionEntry(command, sourceIndex, effectiveLocale) {
  const localized = localizeMetadata(command, effectiveLocale);
  const localizedName = [createSearchField(localized.name)].filter(Boolean);
  const localizedKeywords = (localized.keywords || []).map(createSearchField).filter(Boolean);
  const localizedText = [localized.name, ...(localized.keywords || [])];
  const pinyin = localizedText.map(transliterate);

  return {
    sourceIndex,
    command: localized,
    fields: {
      localizedName,
      englishName: [createSearchField(localized.englishName)].filter(Boolean),
      localizedKeywords,
      englishKeywords: (localized.englishKeywords || []).map(createSearchField).filter(Boolean),
      fullPinyin: pinyin.map(({ full }) => createSearchField(full)).filter(Boolean),
      pinyinInitials: pinyin.map(({ initials }) => createSearchField(initials)).filter(Boolean),
      commandId: [createSearchField(localized.id)].filter(Boolean)
    }
  };
}

export function createSearchProjection(commands, effectiveLocale) {
  if (!Array.isArray(commands)) return [];
  return commands
    .filter(isCommandPresentable)
    .map((command, sourceIndex) => createProjectionEntry(command, sourceIndex, effectiveLocale));
}

function fieldMatches(field, query) {
  const candidates = [field.normalized, field.compact].filter(Boolean);
  const queries = [query.normalized, query.compact].filter(Boolean);
  if (queries.some((needle) => candidates.some((value) => value === needle))) return "exact";
  if (queries.some((needle) => candidates.some((value) => value.startsWith(needle)))) return "prefix";
  if (queries.some((needle) => candidates.some((value) => value.includes(needle)))) return "substring";
  return null;
}

function fieldsFor(entry, fieldName) {
  return Array.isArray(entry.fields[fieldName]) ? entry.fields[fieldName] : [];
}

function bestFieldMatch(entry, rawQuery) {
  const query = { normalized: normalizeText(rawQuery), compact: compactText(rawQuery) };
  if (!query.normalized) return null;

  const rankedFields = [
    ["localizedName", RELEVANCE.LOCALIZED_NAME_EXACT, RELEVANCE.LOCALIZED_NAME_PREFIX],
    ["englishName", RELEVANCE.ENGLISH_NAME_EXACT, RELEVANCE.ENGLISH_NAME_PREFIX],
    ["localizedKeywords", RELEVANCE.LOCALIZED_KEYWORD_EXACT, RELEVANCE.LOCALIZED_KEYWORD_PREFIX],
    ["englishKeywords", RELEVANCE.ENGLISH_KEYWORD_EXACT, RELEVANCE.ENGLISH_KEYWORD_PREFIX],
    ["commandId", RELEVANCE.COMMAND_ID_EXACT, RELEVANCE.COMMAND_ID_PREFIX],
    ["fullPinyin", RELEVANCE.FULL_PINYIN_EXACT, RELEVANCE.FULL_PINYIN_PREFIX],
    ["pinyinInitials", RELEVANCE.PINYIN_INITIALS_EXACT, RELEVANCE.PINYIN_INITIALS_PREFIX]
  ];

  // The field/class sequence deliberately encodes the published relevance
  // order. A localized prefix stays ahead of an English exact match.
  for (const [fieldName, exactClass, prefixClass] of rankedFields) {
    const matches = fieldsFor(entry, fieldName).map((field) => fieldMatches(field, query));
    if (matches.includes("exact")) return { relevance: exactClass, kind: "exact" };
    if (matches.includes("prefix")) return { relevance: prefixClass, kind: "prefix" };
  }

  for (const [fieldName] of rankedFields) {
    if (fieldsFor(entry, fieldName).some((field) => fieldMatches(field, query) === "substring")) {
      return { relevance: RELEVANCE.SUBSTRING, kind: "substring" };
    }
  }
  return null;
}

export function textRelevance(entry, normalizedQuery) {
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const tokenMatches = tokens.map((token) => bestFieldMatch(entry, token));
  if (tokenMatches.some((match) => !match)) return null;

  const wholeQueryMatch = bestFieldMatch(entry, normalizedQuery);
  const relevance = tokenMatches.map((match) => match.relevance);
  const weakest = Math.max(...relevance);
  return {
    wholeQuery: wholeQueryMatch?.relevance || weakest,
    weakest,
    aggregate: relevance.reduce((total, value) => total + value, 0),
    exactCount: tokenMatches.filter((match) => match.kind === "exact").length,
    prefixCount: tokenMatches.filter((match) => match.kind === "prefix").length
  };
}

function compareTextRelevance(left, right) {
  return left.wholeQuery - right.wholeQuery
    || left.weakest - right.weakest
    || left.aggregate - right.aggregate
    || right.exactCount - left.exactCount
    || right.prefixCount - left.prefixCount;
}

function usageFact(usage, commandId) {
  const fact = usage?.[commandId];
  if (!fact || !Number.isSafeInteger(fact.usageCount) || fact.usageCount <= 0
    || !Number.isSafeInteger(fact.lastUsedAt) || fact.lastUsedAt < 0) {
    return { usageCount: 0, lastUsedAt: 0 };
  }
  return { usageCount: fact.usageCount, lastUsedAt: fact.lastUsedAt };
}

export function decayedUsageScore(fact, now) {
  if (!fact.usageCount) return 0;
  const age = Math.max(0, now - fact.lastUsedAt);
  return Math.log1p(fact.usageCount) * Math.pow(0.5, age / THIRTY_DAYS_MS);
}

export function normalizePinnedIds(pinnedIds = []) {
  if (!Array.isArray(pinnedIds)) {
    throw new TypeError("Command Search pinnedIds must be an array");
  }
  const result = new Set();
  for (const commandId of pinnedIds) {
    if (typeof commandId !== "string" || commandId.trim().length === 0 || result.has(commandId)) {
      throw new TypeError("Command Search pinnedIds must contain unique non-empty strings");
    }
    result.add(commandId);
  }
  return result;
}

function cloneCommand(command) {
  return structuredClone(command);
}

export class CommandSearchService {
  constructor({ getCommands, localizationService, usageHistory, now = () => Date.now() } = {}) {
    if (typeof getCommands !== "function") {
      throw new TypeError("CommandSearchService requires a Command catalog function");
    }
    if (!localizationService || typeof localizationService.getSnapshot !== "function") {
      throw new TypeError("CommandSearchService requires LocalizationService");
    }
    if (!usageHistory || typeof usageHistory.getSnapshot !== "function") {
      throw new TypeError("CommandSearchService requires CommandUsageHistory");
    }
    if (typeof now !== "function") {
      throw new TypeError("CommandSearchService requires a clock function");
    }
    this.getCommands = getCommands;
    this.localizationService = localizationService;
    this.usageHistory = usageHistory;
    this.now = now;
    this.projection = null;
  }

  getProjection() {
    const snapshot = this.localizationService.getSnapshot();
    const effectiveLocale = snapshot?.effectiveLocale === "zh-CN" ? "zh-CN" : "en";
    if (!this.projection || this.projection.effectiveLocale !== effectiveLocale) {
      this.projection = {
        effectiveLocale,
        entries: createSearchProjection(this.getCommands(), effectiveLocale)
      };
    }
    return this.projection;
  }

  search(query, pinnedIds = []) {
    const normalizedQuery = normalizeText(query);
    const pins = normalizePinnedIds(pinnedIds);
    const now = this.now();
    const safeNow = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
    const usage = this.usageHistory.getSnapshot();
    const { entries } = this.getProjection();

    const results = entries
      .map((entry) => {
        const text = normalizedQuery ? textRelevance(entry, normalizedQuery) : null;
        if (normalizedQuery && !text) return null;
        const fact = usageFact(usage, entry.command.id);
        return {
          entry,
          text,
          pinned: pins.has(entry.command.id),
          fact,
          score: decayedUsageScore(fact, safeNow)
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (normalizedQuery) {
          const textOrder = compareTextRelevance(left.text, right.text);
          if (textOrder) return textOrder;
        }
        return Number(right.pinned) - Number(left.pinned)
          || right.score - left.score
          || right.fact.lastUsedAt - left.fact.lastUsedAt
          || right.fact.usageCount - left.fact.usageCount
          || left.entry.sourceIndex - right.entry.sourceIndex;
      });

    return {
      commands: results.map(({ entry }) => cloneCommand(entry.command)),
      usedCommandIds: results
        .filter(({ fact }) => fact.usageCount > 0)
        .map(({ entry }) => entry.command.id)
    };
  }
}
