const { globalShortcut } = require("electron");

const DEFAULT_ACCELERATOR = "CommandOrControl+Space";

function getPaletteAccelerator() {
  return process.env.RESOLVE_COMMAND_CENTER_HOTKEY || DEFAULT_ACCELERATOR;
}

async function isResolveForeground(getProcessName) {
  try {
    if (typeof getProcessName !== "function") return false;
    return (await getProcessName()).toLowerCase() === "resolve.exe";
  } catch {
    return false;
  }
}

function registerPaletteHotkey(onToggle, isPaletteShown = () => false, getProcessName) {
  const accelerator = getPaletteAccelerator();
  const registered = globalShortcut.register(accelerator, async () => {
    if (isPaletteShown()) return onToggle();
    if (await isResolveForeground(getProcessName) && !isPaletteShown()) onToggle();
  });

  if (!registered) {
    console.warn(`Failed to register global shortcut: ${accelerator}`);
  }

  return registered;
}

module.exports = {
  getPaletteAccelerator,
  isResolveForeground,
  registerPaletteHotkey
};
