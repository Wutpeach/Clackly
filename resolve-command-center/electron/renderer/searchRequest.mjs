export function createSearchRequestGate() {
  let currentRevision = 0;
  return {
    begin() {
      currentRevision += 1;
      return currentRevision;
    },
    isCurrent(revision) {
      return revision === currentRevision;
    }
  };
}

/**
 * Keeps a user-selected Command selected after Core returns a reordered
 * result list. The caller supplies the already-active presentation list, so
 * this helper neither filters nor ranks Commands.
 */
export function findSelectedCommandIndex(commands, commandId, limit = Infinity) {
  if (!Array.isArray(commands) || typeof commandId !== "string" || commandId.length === 0) {
    return 0;
  }
  const boundedCommands = commands.slice(0, Math.max(0, limit));
  const index = boundedCommands.findIndex((command) => command?.id === commandId);
  return index >= 0 ? index : 0;
}
