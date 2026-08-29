import { pinyin } from "pinyin-pro";

const HAN_CHARACTER = /\p{Script=Han}/u;
const LATIN_OR_NUMBER = /[\p{L}\p{N}]/u;

export function normalizeText(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")
    : "";
}

/**
 * Uses pinyin-pro only as a one-reading transliteration primitive. Search
 * normalization, compact forms, initials, and matching stay Clackly-owned.
 */
export function transliterate(value) {
  const source = typeof value === "string" ? value : "";
  if (!source.trim()) return { full: "", initials: "" };

  const characters = Array.from(source);
  const syllables = pinyin(source, { toneType: "none", type: "array" });
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
