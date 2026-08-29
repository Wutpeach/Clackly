export function isCommandPresentable(command) {
  return Boolean(command) && command.presentation !== "internal";
}
