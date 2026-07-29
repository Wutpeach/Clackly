const defaultShortcuts = require("./shortcuts.json");

class ShortcutManager {
  constructor({ shortcuts = defaultShortcuts, keyboardExecutor = null } = {}) {
    if (!shortcuts || typeof shortcuts !== "object" || Array.isArray(shortcuts)) {
      throw new TypeError("ShortcutManager requires a function-to-shortcut mapping");
    }

    this.shortcuts = { ...shortcuts };
    this.keyboardExecutor = keyboardExecutor;
  }

  getShortcut(functionName) {
    return this.shortcuts[functionName] || null;
  }

  get(functionName) {
    return this.getShortcut(functionName);
  }

  hasShortcut(functionName) {
    return this.getShortcut(functionName) !== null;
  }

  has(functionName) {
    return this.hasShortcut(functionName);
  }

  listShortcuts() {
    return Object.entries(this.shortcuts).map(([functionName, shortcut]) => ({
      functionName,
      shortcut
    }));
  }

  canExecute(functionName) {
    return this.hasShortcut(functionName) && (
      typeof this.keyboardExecutor === "function" ||
      Boolean(this.keyboardExecutor && typeof this.keyboardExecutor.execute === "function")
    );
  }

  async execute(functionName, context) {
    const shortcut = this.getShortcut(functionName);
    if (!shortcut) {
      throw new Error(`No shortcut is configured for ${functionName}`);
    }

    const request = { functionName, shortcut, context };
    if (typeof this.keyboardExecutor === "function") {
      return this.keyboardExecutor(request);
    }

    if (this.keyboardExecutor && typeof this.keyboardExecutor.execute === "function") {
      return this.keyboardExecutor.execute(request);
    }

    throw new Error(`Keyboard execution is unavailable for ${functionName}`);
  }
}

module.exports = {
  ShortcutManager
};
