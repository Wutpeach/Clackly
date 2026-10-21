export const UPDATE_STATUSES = Object.freeze([
  "idle", "checking", "no-release", "up-to-date", "available", "downloading", "verifying",
  "downloaded", "cancelled", "error", "unavailable"
]);

export const UPDATE_ERROR_KEYS = Object.freeze({
  "rate-limit": "rateLimit", offline: "offline", timeout: "timeout",
  "insufficient-space": "space", "hash-mismatch": "corrupt", "invalid-package": "package",
  "version-mismatch": "version", "invalid-installed-version": "installedVersion",
  unsupported: "unsupported", "download-failed": "download", "check-failed": "check",
  "unsafe-path": "path", "missing-digest": "package",
  "unsupported-platform": "unsupported", "invalid-version": "version", "invalid-source": "source",
  "invalid-response": "check", "invalid-asset": "package", "invalid-zip": "package",
  "disk-space": "space", checksum: "corrupt", "size-limit": "package", network: "offline", storage: "path"
});

export const INSTALLATION_STATUSES = Object.freeze([
  "unavailable", "ready", "awaiting-confirmation", "waiting-for-exit", "installing",
  "installed", "rolled-back", "failed", "cancelled"
]);
export const INSTALLATION_REASONS = Object.freeze([
  "qualification-required", "publisher-unverified", "host-unqualified", "target-unverified",
  "permission-denied", "permission-cancelled", "process-unknown", "host-running",
  "concurrent-install", "recovery-required", "invalid-package", "install-failed", "no-candidate", "unsupported-host",
  "native-missing", "native-invalid", "native-incompatible"
]);

export function unavailableUpdateSnapshot() {
  return { schemaVersion: 1, status: "unavailable", currentVersion: null, latestVersion: null, downloadedVersion: null,
    installation: { status: "unavailable", reason: "qualification-required" },
    releaseNotes: "", checkedAt: null, retryAt: null, receivedBytes: 0, totalBytes: 0, error: null };
}

// Project only bounded display data. Never render OS/network error text or paths.
export function normalizeUpdateSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || !UPDATE_STATUSES.includes(value.status)) return unavailableUpdateSnapshot();
  const version = (input) => typeof input === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(input) && input.length <= 80 ? input : null;
  const bytes = (input) => Number.isSafeInteger(input) && input >= 0 ? input : 0;
  const timestamp = (input) => Number.isSafeInteger(input) && input > 0 && input <= 8_640_000_000_000_000 ? input : null;
  return { schemaVersion: 1, status: value.status, currentVersion: version(value.currentVersion),
    latestVersion: version(value.latestVersion), downloadedVersion: version(value.downloadedVersion),
    installation: {
      status: INSTALLATION_STATUSES.includes(value.installation?.status) ? value.installation.status : "unavailable",
      reason: INSTALLATION_REASONS.includes(value.installation?.reason) ? value.installation.reason
        : value.installation?.reason == null && INSTALLATION_STATUSES.includes(value.installation?.status) ? null : "qualification-required"
    },
    releaseNotes: typeof value.releaseNotes === "string"
      ? value.releaseNotes.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 6000) : "",
    checkedAt: timestamp(value.checkedAt), retryAt: timestamp(value.retryAt),
    receivedBytes: bytes(value.receivedBytes), totalBytes: bytes(value.totalBytes),
    error: typeof value.error?.code === "string" ? { code: value.error.code } : null,
    ...(value.fixture === true ? { fixture: true } : {}) };
}

export function getUpdatePresentation(state, now = Date.now()) {
  const active = ["checking", "downloading", "verifying"].includes(state.status);
  const installationStatus = state.installation?.status || "unavailable";
  const installationActive = ["awaiting-confirmation", "waiting-for-exit", "installing"].includes(installationStatus);
  const installed = installationStatus === "installed";
  const candidate = Boolean(state.downloadedVersion);
  const coolingDown = Boolean(state.retryAt && state.retryAt > now);
  const retryableDownload = state.status === "cancelled" || (state.status === "error" &&
    ["download-failed", "hash-mismatch", "invalid-package", "version-mismatch", "insufficient-space", "unsafe-path", "timeout", "offline", "invalid-version", "invalid-zip", "disk-space", "checksum", "network", "storage", "size-limit"].includes(state.error?.code));
  return {
    statusKey: state.error ? "settings.update.error." + (state.error.code === "invalid-version" && !state.currentVersion ? "installedVersion" : UPDATE_ERROR_KEYS[state.error.code] || "generic") : "settings.update.status." + state.status,
    canCheck: !active && !installationActive && !installed && !coolingDown && Boolean(state.currentVersion) &&
      (state.status !== "unavailable" || ["invalid-asset", "invalid-source", "missing-digest", "invalid-package", "invalid-response", "invalid-version"].includes(state.error?.code)),
    canDownload: !candidate && !installationActive && !installed && !coolingDown && Boolean(state.currentVersion && state.latestVersion) && (state.status === "available" || retryableDownload),
    canCancel: state.status === "downloading" || state.status === "verifying",
    canDiscard: candidate && !active && !installationActive && !installed,
    canPrepareInstall: candidate && Boolean(state.currentVersion) && !active &&
      (installationStatus === "ready" && state.installation.reason === null ||
        installationStatus === "cancelled" && [null, "permission-cancelled"].includes(state.installation.reason)),
    canConfirmInstall: candidate && Boolean(state.currentVersion) && !active && installationStatus === "awaiting-confirmation" && state.installation.reason === null,
    canCancelInstall: ["awaiting-confirmation", "waiting-for-exit"].includes(installationStatus),
    installationKey: "settings.update.install.status." + installationStatus,
    installationReasonKey: state.installation?.reason ? "settings.update.install.reason." + state.installation.reason : null,
    retryableDownload,
    progress: state.totalBytes > 0 ? Math.min(100, Math.round(state.receivedBytes / state.totalBytes * 100)) : null
  };
}
