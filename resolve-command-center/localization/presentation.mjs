import { translate } from "./resources.mjs";
import { localizeMetadata, localizeFeatureMetadata, localizeCommands } from "./metadata.mjs";

export { localizeMetadata, localizeFeatureMetadata, localizeCommands };

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
