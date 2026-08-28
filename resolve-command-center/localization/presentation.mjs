import { translate } from "./resources.mjs";

export function localizeMetadata(metadata, locale) {
  if (!metadata || typeof metadata !== "object") return metadata;
  const overlay = metadata.localizations?.[locale] || {};
  const result = {
    ...metadata,
    englishName: metadata.name,
    englishKeywords: Array.isArray(metadata.keywords) ? [...metadata.keywords] : []
  };
  for (const field of ["name", "description", "category", "keywords"]) {
    if (overlay[field] !== undefined) result[field] = Array.isArray(overlay[field]) ? [...overlay[field]] : overlay[field];
  }
  return result;
}

export function localizeFeatureMetadata(feature, locale) {
  const localized = localizeMetadata(feature, locale);
  return {
    ...localized,
    configSchema: Object.fromEntries(Object.entries(localized.configSchema || {}).map(([key, field]) => {
      const overlay = field.localizations?.[locale] || {};
      const baseOptionLabels = field.optionLabels && typeof field.optionLabels === "object" && !Array.isArray(field.optionLabels)
        ? field.optionLabels
        : null;
      const localizedOptionLabels = overlay.optionLabels && typeof overlay.optionLabels === "object" && !Array.isArray(overlay.optionLabels)
        ? overlay.optionLabels
        : null;
      return [key, {
        ...field,
        ...(typeof overlay.label === "string" ? { label: overlay.label } : {}),
        ...(baseOptionLabels || localizedOptionLabels
          ? { optionLabels: { ...baseOptionLabels, ...localizedOptionLabels } }
          : {})
      }];
    }))
  };
}

export function localizeCommands(commands, locale) {
  return (commands || []).map((command) => localizeMetadata(command, locale));
}

const KNOWN_ERROR_CODES = new Set([
  "clipboard-image-not-found",
  "clipboard-image-read-failed",
  "clipboard-image-save-failed",
  "clipboard-image-path-unsafe",
  "resolve-project-unavailable",
  "media-pool-import-failed"
]);

export function presentError(error, t) {
  return KNOWN_ERROR_CODES.has(error?.code) ? t(`error.${error.code}`) : t("error.generic");
}

export function createTranslator(locale) {
  return (key, params) => translate(locale, key, params);
}
