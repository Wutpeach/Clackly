import { pinyin, polyphonic } from "pinyin-pro";

const HAN_CHARACTER = /\p{Script=Han}/u;
const LATIN_OR_NUMBER = /[\p{L}\p{N}]/u;

export function normalizeText(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")
    : "";
}

function transliterationFromSyllables(source, syllables) {
  const characters = Array.from(source);
  const fullParts = [];
  const initialParts = [];
  let previousWasLatinOrNumber = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const normalizedSyllable = normalizeText(syllables[index] || character);
    if (normalizedSyllable) fullParts.push(normalizedSyllable);

    if (HAN_CHARACTER.test(character)) {
      if (normalizedSyllable) initialParts.push(normalizedSyllable.charAt(0));
      previousWasLatinOrNumber = false;
      continue;
    }

    if (LATIN_OR_NUMBER.test(character)) {
      if (!previousWasLatinOrNumber) initialParts.push(normalizeText(character).charAt(0));
      previousWasLatinOrNumber = true;
    } else {
      previousWasLatinOrNumber = false;
    }
  }

  return {
    full: fullParts.join("").replace(/\s+/g, ""),
    initials: initialParts.join("")
  };
}

/**
 * Uses pinyin-pro only as a one-reading transliteration primitive. Search
 * normalization, compact forms, initials, and matching stay Clackly-owned.
 */
export function transliterate(value) {
  const source = typeof value === "string" ? value : "";
  if (!source.trim()) return { full: "", initials: "" };
  return transliterationFromSyllables(source, pinyin(source, { toneType: "none", type: "array" }));
}

/**
 * Projects the primary reading plus bounded, name-only polyphonic readings.
 * Each alternative replaces exactly one primary syllable; alternatives are
 * deliberately never combined into a Cartesian product.
 */
export function transliterateName(value) {
  const source = typeof value === "string" ? value : "";
  if (!source.trim()) return { full: [], initials: [] };

  const primarySyllables = pinyin(source, { toneType: "none", type: "array" });
  const primary = transliterationFromSyllables(source, primarySyllables);
  const full = new Set(primary.full ? [primary.full] : []);
  const initials = new Set(primary.initials ? [primary.initials] : []);
  const characters = Array.from(source);
  const alternatives = polyphonic(source, { toneType: "none", type: "array" });

  for (let index = 0; index < characters.length; index += 1) {
    if (!HAN_CHARACTER.test(characters[index]) || !Array.isArray(alternatives[index])) continue;

    const primarySyllable = normalizeText(primarySyllables[index] || characters[index]);
    for (const alternative of alternatives[index]) {
      const normalizedAlternative = normalizeText(alternative);
      if (!normalizedAlternative || normalizedAlternative === primarySyllable) continue;

      const syllables = [...primarySyllables];
      syllables[index] = normalizedAlternative;
      const candidate = transliterationFromSyllables(source, syllables);
      if (candidate.full) full.add(candidate.full);
      if (candidate.initials) initials.add(candidate.initials);
    }
  }

  return { full: [...full], initials: [...initials] };
}
