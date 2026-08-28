const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PALETTE_HOST,
  PALETTE_INTERACTION_MODE,
  PALETTE_SURFACE,
  TRANSPARENT_ATTACHED_POLICY,
  WINDOWS_NATIVE_DUAL_WINDOW_POLICY,
  selectPaletteHostPolicy,
  usesWindowsNativeDualWindow
} = require("./paletteHostPolicy");

test("every Windows native entry selects the unified D6/D7 policy independently of packaging or renderer mode", () => {
  for (const host of [PALETTE_HOST.STANDALONE, PALETTE_HOST.WORKFLOW]) {
    for (const execution of [
      { isPackaged: false, devRenderer: true },
      { isPackaged: false, devRenderer: false },
      { isPackaged: true, devRenderer: false }
    ]) {
      const policy = selectPaletteHostPolicy({ host, platform: "win32", ...execution });
      assert.equal(policy, WINDOWS_NATIVE_DUAL_WINDOW_POLICY);
      assert.equal(policy.surface, PALETTE_SURFACE.OPAQUE_FULL_BLEED);
      assert.equal(policy.interactionPanel, PALETTE_INTERACTION_MODE.DETACHED_NATIVE);
      assert.equal(policy.ignoreFocusedBlur, true);
      assert.equal(usesWindowsNativeDualWindow(policy), true);
    }
  }
});

test("non-Windows hosts and unknown host identities retain the compatible attached fallback", () => {
  for (const platform of ["darwin", "linux", undefined]) {
    for (const host of [PALETTE_HOST.STANDALONE, PALETTE_HOST.WORKFLOW, "unknown", undefined]) {
      const policy = selectPaletteHostPolicy({ host, platform });
      assert.equal(policy, TRANSPARENT_ATTACHED_POLICY);
      assert.equal(policy.surface, null);
      assert.equal(policy.interactionPanel, null);
      assert.equal(policy.ignoreFocusedBlur, false);
      assert.equal(usesWindowsNativeDualWindow(policy), false);
    }
  }
});
