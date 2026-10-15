import { createTranslator } from "../../localization/presentation.mjs";

const defaultT = createTranslator("en");

export function createInteractionPanelPresentation(selectedCommand, interactionRows, effectiveLocale = "en", t = defaultT) {
  if (!selectedCommand) return null;
  if (interactionRows.length > 1) {
    return {
      kind: "mappings",
      effectiveLocale,
      ariaLabel: t("interaction.ariaLabel"),
      rows: interactionRows.map(({ label, actionName, trigger }) => ({
        label,
        actionName,
        ...(trigger ? { trigger: { ...trigger, modifiers: [...trigger.modifiers] } } : {}),
        ariaLabel: t("interaction.rowAria", { label, actionName })
      }))
    };
  }
  return {
    kind: "description",
    effectiveLocale,
    ariaLabel: t("interaction.ariaLabel"),
    description: selectedCommand.description
  };
}
