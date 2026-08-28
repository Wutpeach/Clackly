export function createInteractionPanelPresentation(selectedCommand, interactionRows) {
  if (!selectedCommand) return null;
  if (interactionRows.length > 1) {
    return {
      kind: "mappings",
      rows: interactionRows.map(({ label, actionName }) => ({ label, actionName }))
    };
  }
  return { kind: "description", description: selectedCommand.description };
}
