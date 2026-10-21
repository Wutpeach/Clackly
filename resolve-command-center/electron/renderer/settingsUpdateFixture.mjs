// Explicit renderer-local simulations only. No network, filesystem, host or release authority.
export const SETTINGS_UPDATE_SCENARIOS = Object.freeze([
  "idle", "no-release", "up-to-date", "available", "checking", "rate-limit", "offline", "timeout",
  "downloading", "verifying", "cancelled", "failure", "corrupt", "space", "version", "downloaded", "unavailable",
  "install-ready", "confirmation", "waiting-exit", "installing", "installed", "rolled-back", "install-failed",
  "install-cancelled", "permission-denied", "permission-cancelled", "recovery-required", "publisher-unverified",
  "native-missing", "native-invalid", "native-incompatible"
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const FIXTURE_TIME = 1_791_958_800_000;

export function createSettingsUpdateFixture({ search = "", schedule = setTimeout, unschedule = clearTimeout } = {}) {
  const params = new URLSearchParams(search);
  const scenario = params.get("settings-update");
  const explicit = params.get("view") === "settings" && SETTINGS_UPDATE_SCENARIOS.includes(scenario);
  const listeners = new Set();
  const pending = new Set();
  let generation = 0;
  let downloadAttempts = 0;
  let finishInstallation = null;
  const base = { schemaVersion: 1, fixture: true, status: "idle", currentVersion: "0.1.0", latestVersion: null,
    downloadedVersion: null, installation: { status: "unavailable", reason: "qualification-required" },
    releaseNotes: "", checkedAt: null, retryAt: null, receivedBytes: 0, totalBytes: 0, error: null };
  let state = explicit ? { ...base } : { ...base, status: "unavailable", currentVersion: null, error: { code: "unsupported" } };
  const note = params.get("locale") === "zh-CN"
    ? "模拟更新说明\n改进 Workflow 更新检查与下载反馈。\n<说明为纯文本，不执行 HTML>"
    : "Simulated release notes\nImproved Workflow update checks and download feedback.\n<This is plain text, not executable HTML>";
  const withRelease = !["idle", "no-release", "checking", "rate-limit", "offline", "timeout", "unavailable"].includes(scenario);
  if (explicit) {
    if (withRelease) Object.assign(state, { latestVersion: scenario === "up-to-date" ? "0.1.0" : "0.2.0", releaseNotes: note, checkedAt: FIXTURE_TIME });
    const errorCode = { "rate-limit": "rate-limit", offline: "network", timeout: "timeout", failure: "storage", corrupt: "checksum", space: "disk-space", version: "invalid-version" }[scenario];
    state.status = errorCode ? "error" : scenario;
    state.error = errorCode ? { code: errorCode } : null;
    if (scenario === "rate-limit") state.retryAt = Date.now() + 60_000;
    if (["downloading", "verifying", "downloaded"].includes(scenario)) {
      state.totalBytes = 50 * 1_048_576;
      state.receivedBytes = scenario === "downloading" ? 20 * 1_048_576 : state.totalBytes;
    }
    if (scenario === "unavailable") Object.assign(state, { currentVersion: null, error: { code: "invalid-version" } });
    const installation = {
      "install-ready": ["ready", null], confirmation: ["awaiting-confirmation", null],
      "waiting-exit": ["waiting-for-exit", "host-running"], installing: ["installing", null], installed: ["installed", null],
      "rolled-back": ["rolled-back", "install-failed"], "install-failed": ["failed", "install-failed"],
      "install-cancelled": ["cancelled", null], "permission-denied": ["unavailable", "permission-denied"],
      "permission-cancelled": ["cancelled", "permission-cancelled"], "recovery-required": ["failed", "recovery-required"],
      "publisher-unverified": ["unavailable", "publisher-unverified"],
    "native-missing": ["failed", "native-missing"], "native-invalid": ["failed", "native-invalid"],
    "native-incompatible": ["failed", "native-incompatible"]
    }[scenario];
    if (scenario === "downloaded" || installation) {
      state.status = "downloaded";
      state.downloadedVersion = "0.2.0";
      if (installation) state.installation = { status: installation[0], reason: installation[1] };
    }
  }
  function publish(patch) {
    state = { ...state, ...patch };
    listeners.forEach((callback) => callback(clone(state)));
    if (finishInstallation && !["awaiting-confirmation", "waiting-for-exit", "installing"].includes(state.installation.status)) {
      const finish = finishInstallation;
      finishInstallation = null;
      finish(clone(state));
    }
    return clone(state);
  }
  function clearPending() {
    generation += 1;
    pending.forEach(unschedule);
    pending.clear();
  }
  function later(delay, patch, token) {
    const id = schedule(() => { pending.delete(id); if (generation === token) publish(patch); }, delay);
    pending.add(id);
  }
  return {
    getUpdateState: async () => clone(state),
    checkForUpdates: async () => {
      if (!explicit || ["checking", "downloading", "verifying"].includes(state.status) ||
        ["awaiting-confirmation", "waiting-for-exit", "installing", "installed"].includes(state.installation.status) || state.retryAt > Date.now()) return clone(state);
      clearPending();
      publish({ status: "checking", error: null });
      const token = generation;
      later(300, { status: scenario === "no-release" ? "no-release" : scenario === "up-to-date" ? "up-to-date" : "available",
        latestVersion: scenario === "no-release" ? null : scenario === "up-to-date" ? "0.1.0" : params.get("update-check") === "newer" ? "0.3.0" : "0.2.0", releaseNotes: scenario === "no-release" ? "" : note,
        checkedAt: FIXTURE_TIME, retryAt: null }, token);
      return clone(state);
    },
    downloadUpdate: async () => {
      if (!explicit || !state.latestVersion || state.downloadedVersion || ["checking", "downloading", "verifying"].includes(state.status)) return clone(state);
      clearPending();
      const token = generation;
      downloadAttempts += 1;
      publish({ status: "downloading", receivedBytes: 0, totalBytes: 50 * 1_048_576, error: null });
      later(150, { receivedBytes: 20 * 1_048_576 }, token);
      if (params.get("update-outcome") === "corrupt-first" && downloadAttempts === 1) {
        later(350, { status: "error", error: { code: "checksum" } }, token);
      } else {
        later(600, { status: "verifying", receivedBytes: 50 * 1_048_576 }, token);
        later(850, { status: "downloaded", downloadedVersion: state.latestVersion,
          installation: { status: params.get("update-install") === "qualified" ? "ready" : "unavailable", reason: params.get("update-install") === "qualified" ? null : "qualification-required" } }, token);
      }
      return clone(state);
    },
    cancelUpdate: async () => {
      if (!explicit || !["downloading", "verifying"].includes(state.status)) return clone(state);
      clearPending();
      return publish({ status: "cancelled", receivedBytes: 0, totalBytes: 0, error: null });
    },
    discardUpdate: async () => {
      if (!explicit || !state.downloadedVersion || ["checking", "downloading", "verifying"].includes(state.status) ||
        ["awaiting-confirmation", "waiting-for-exit", "installing", "installed"].includes(state.installation.status)) return clone(state);
      clearPending();
      return publish({ status: state.latestVersion && state.latestVersion !== state.currentVersion ? "available" : "idle",
        downloadedVersion: null, receivedBytes: 0, totalBytes: 0, error: null, installation: { status: "unavailable", reason: "no-candidate" } });
    },
    prepareUpdateInstall: async () => {
      if (!explicit || !state.downloadedVersion || !["ready", "cancelled"].includes(state.installation.status)) return clone(state);
      return publish({ installation: { status: "awaiting-confirmation", reason: null } });
    },
    confirmUpdateInstall: async () => {
      if (!explicit || !state.downloadedVersion || state.installation.status !== "awaiting-confirmation") return clone(state);
      clearPending();
      const token = generation;
      // Match the host IPC lifetime: confirm stays pending until cancellation or a terminal result.
      const completion = new Promise((resolve) => { finishInstallation = resolve; });
      publish({ installation: { status: "waiting-for-exit", reason: "host-running" } });
      later(800, { installation: { status: "installing", reason: null } }, token);
      const outcome = params.get("install-outcome");
      later(1400, { installation: outcome === "rollback" ? { status: "rolled-back", reason: "install-failed" }
        : outcome === "recovery" ? { status: "failed", reason: "recovery-required" } : { status: "installed", reason: null } }, token);
      return completion;
    },
    cancelUpdateInstall: async () => {
      if (!explicit || !["awaiting-confirmation", "waiting-for-exit"].includes(state.installation.status)) return clone(state);
      clearPending();
      return publish({ installation: { status: "cancelled", reason: null } });
    },
    onUpdateStateChanged: (callback) => { listeners.add(callback); return () => listeners.delete(callback); }
  };
}
