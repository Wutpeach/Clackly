import { translate } from "./resources.mjs";
import { localizeMetadata, localizeFeatureMetadata, localizeCommands } from "./metadata.mjs";

export { localizeMetadata, localizeFeatureMetadata, localizeCommands };

const KNOWN_ERROR_CODES = new Set([
  "clipboard-image-not-found",
  "clipboard-image-read-failed",
  "clipboard-image-save-failed",
  "clipboard-image-path-unsafe",
  "resolve-project-unavailable",
  "media-pool-import-failed",
  "resolve-script-not-submitted",
  "resolve-script-submission-unknown"
]);

const ELECTRON_SCRIPT_ERROR_CODES = new Map([
  ["Error invoking remote method 'commands:execute': Error: resolve-script-not-submitted", "resolve-script-not-submitted"],
  ["Error invoking remote method 'commands:execute': Error: resolve-script-submission-unknown", "resolve-script-submission-unknown"]
]);

export function presentError(error, t) {
  const code = KNOWN_ERROR_CODES.has(error?.code)
    ? error.code
    : ELECTRON_SCRIPT_ERROR_CODES.get(error?.message);
  return code ? t(`error.${code}`) : t("error.generic");
}

export function createTranslator(locale) {
  return (key, params) => translate(locale, key, params);
}
