import test from "node:test";
import assert from "node:assert/strict";
import { getUpdatePresentation, normalizeUpdateSnapshot, UPDATE_STATUSES, UPDATE_ERROR_KEYS, INSTALLATION_STATUSES, INSTALLATION_REASONS } from "./updatePresentation.mjs";
import { resources, translate } from "../../localization/resources.mjs";
import { createSettingsUpdateFixture, SETTINGS_UPDATE_SCENARIOS } from "./settingsUpdateFixture.mjs";
import { createBrowserPreviewApi } from "./browserPreview.mjs";

const state = (patch = {}) => normalizeUpdateSnapshot({ schemaVersion: 1, status: "available", currentVersion: "0.1.0", latestVersion: "0.2.0", ...patch });

test("update feedback covers every status and controlled host error in both languages", () => {
  for (const locale of ["en", "zh-CN"]) {
    for (const key of [...UPDATE_STATUSES.map((status) => 'settings.update.status.' + status), ...Object.values(UPDATE_ERROR_KEYS).map((error) => 'settings.update.error.' + error),
      ...INSTALLATION_STATUSES.map((status) => 'settings.update.install.status.' + status), ...INSTALLATION_REASONS.map((reason) => 'settings.update.install.reason.' + reason)]) {
      assert.ok(resources[locale][key], locale + ' supplies ' + key);
      assert.notEqual(translate(locale, key), "Unavailable");
    }
    assert.match(translate(locale, "settings.update.transferred", { percent: 40, received: 20, total: 50 }), /40%/);
  }
});

test("update actions respect active operations, server retry time and installation boundary", () => {
  assert.equal(getUpdatePresentation(state()).canDownload, true);
  for (const status of ["checking", "downloading", "verifying"]) {
    const view = getUpdatePresentation(state({ status }));
    assert.equal(view.canCheck, false);
    assert.equal(view.canDownload, false);
  }
  assert.equal(getUpdatePresentation(state({ status: "downloaded" })).canDownload, false);
  assert.equal(getUpdatePresentation(state({ status: "error", retryAt: 2000, error: { code: "rate-limit" } }), 1000).canCheck, false);
  assert.equal(getUpdatePresentation(state({ status: "error", retryAt: 2000, error: { code: "rate-limit" } }), 2000).canCheck, true);
  assert.equal(getUpdatePresentation(state({ status: "error", error: { code: "checksum" } })).canDownload, true);
  assert.equal(getUpdatePresentation(state({ status: "unavailable", currentVersion: null, error: { code: "invalid-version" } })).statusKey, "settings.update.error.installedVersion");
  assert.equal(getUpdatePresentation(state({ status: "unavailable", error: { code: "unsupported-platform" } })).canCheck, false);
  assert.equal(getUpdatePresentation(state({ status: "unavailable", downloadedVersion: "0.2.0", error: { code: "invalid-asset" } })).canCheck, true, "a corrected release can be discovered while the candidate is retained");
  assert.equal(getUpdatePresentation(state({ status: "unavailable", currentVersion: null, error: { code: "invalid-asset" } })).canCheck, false);
});

test("update display bounds release text and byte progress without exposing raw error fields", () => {
  const projected = state({ releaseNotes: 'x'.repeat(7000), error: { code: "network", message: "private path" }, totalBytes: 100, receivedBytes: 150 });
  assert.equal(projected.releaseNotes.length, 6000);
  assert.deepEqual(projected.error, { code: "network" });
  assert.equal(getUpdatePresentation(projected).progress, 100);
  assert.equal(state({ currentVersion: "C:/private" }).currentVersion, null);
  assert.equal(normalizeUpdateSnapshot({ schemaVersion: 2 }).status, "unavailable");
  assert.equal(state({ releaseNotes: "text\u0000\u0007\nline" }).releaseNotes, "text\nline");
  assert.deepEqual(state({ installation: { status: "unknown", reason: "C:/private", target: "private" } }).installation,
    { status: "unavailable", reason: "qualification-required" });
  assert.equal(state({ downloadedVersion: "C:/private" }).downloadedVersion, null);
});

test("local Workflow component failures retain the candidate and expose a bounded repair reason", async () => {
  for (const reason of ["native-missing", "native-invalid", "native-incompatible"]) {
    const api = createSettingsUpdateFixture({ search: "?view=settings&settings-update=" + reason });
    const snapshot = normalizeUpdateSnapshot(await api.getUpdateState());
    const view = getUpdatePresentation(snapshot);
    assert.deepEqual(snapshot.installation, { status: "failed", reason });
    assert.equal(snapshot.currentVersion, "0.1.0");
    assert.equal(snapshot.downloadedVersion, "0.2.0");
    assert.equal(view.installationReasonKey, "settings.update.install.reason." + reason);
    assert.equal(view.canPrepareInstall, false);
    assert.equal(view.canConfirmInstall, false);
    assert.equal(view.canDiscard, true);
  }
});

test("retained candidates and installation qualifications control visible actions independently of discovery", () => {
  const candidate = { downloadedVersion: "0.2.0", latestVersion: "0.3.0", status: "available" };
  const blocked = getUpdatePresentation(state(candidate));
  assert.equal(blocked.canCheck, true);
  assert.equal(blocked.canDiscard, true);
  assert.equal(blocked.canDownload, false);
  assert.equal(blocked.canPrepareInstall, false);
  assert.equal(getUpdatePresentation(state({ ...candidate, installation: { status: "ready", reason: null } })).canPrepareInstall, true);
  assert.equal(getUpdatePresentation(state({ installation: { status: "ready", reason: null } })).canPrepareInstall, false);
  assert.equal(getUpdatePresentation(state({ ...candidate, installation: { status: "ready", reason: "unknown" } })).canPrepareInstall, false);
  assert.equal(getUpdatePresentation(state({ ...candidate, currentVersion: null, installation: { status: "ready", reason: null } })).canPrepareInstall, false);
  for (const reason of [null, "permission-cancelled"]) {
    assert.equal(getUpdatePresentation(state({ ...candidate, installation: { status: "cancelled", reason } })).canPrepareInstall, true, 'cancelled candidate can request fresh host qualification');
  }
  assert.equal(getUpdatePresentation(state({ ...candidate, installation: { status: "cancelled", reason: "recovery-required" } })).canPrepareInstall, false);
  for (const status of ["awaiting-confirmation", "waiting-for-exit", "installing", "installed"]) {
    const view = getUpdatePresentation(state({ ...candidate, installation: { status, reason: null } }));
    assert.equal(view.canCheck, false);
    assert.equal(view.canDiscard, false);
    assert.equal(view.canDownload, false);
    assert.equal(view.canConfirmInstall, status === "awaiting-confirmation");
    assert.equal(view.canCancelInstall, ["awaiting-confirmation", "waiting-for-exit"].includes(status));
  }
});

function controlledFixture(search) {
  const scheduled = new Map();
  let next = 0;
  const api = createSettingsUpdateFixture({ search, schedule: (fn, delay) => { const id = ++next; scheduled.set(id, { fn, delay }); return id; }, unschedule: (id) => scheduled.delete(id) });
  return { api, flush() { [...scheduled.entries()].sort((a, b) => a[1].delay - b[1].delay).forEach(([id, entry]) => { if (scheduled.delete(id)) entry.fn(); }); } };
}

test("simulated updates require explicit Settings fixtures and never report real releases", async () => {
  for (const search of ["", "?settings-update=available", "?view=settings&settings-update=unknown"]) {
    const api = createBrowserPreviewApi({ search });
    assert.equal((await api.getUpdateState()).status, "unavailable");
    assert.equal((await api.checkForUpdates()).status, "unavailable");
    assert.equal((await api.downloadUpdate()).status, "unavailable");
    for (const method of ["prepareUpdateInstall", "confirmUpdateInstall", "cancelUpdateInstall", "discardUpdate"]) {
      assert.equal((await api[method]()).status, "unavailable");
    }
  }
  for (const name of SETTINGS_UPDATE_SCENARIOS) {
    const api = createSettingsUpdateFixture({ search: '?view=settings&settings-update=' + name });
    assert.equal((await api.getUpdateState()).fixture, true);
  }
});

test("candidate recheck preserves download until explicit discard permits the newer version", async () => {
  const { api, flush } = controlledFixture("?view=settings&settings-update=downloaded&update-check=newer");
  assert.equal((await api.getUpdateState()).downloadedVersion, "0.2.0");
  assert.equal((await api.checkForUpdates()).status, "checking");
  flush();
  assert.equal((await api.getUpdateState()).latestVersion, "0.3.0");
  assert.equal((await api.downloadUpdate()).downloadedVersion, "0.2.0");
  assert.equal((await api.discardUpdate()).downloadedVersion, null);
  await api.downloadUpdate(); flush();
  assert.equal((await api.getUpdateState()).downloadedVersion, "0.3.0");
  assert.equal((await api.getUpdateState()).currentVersion, "0.1.0");
});

test("only explicit simulated qualification permits confirmation, cancel and isolated install outcomes", async () => {
  const blocked = controlledFixture("?view=settings&settings-update=downloaded");
  assert.equal((await blocked.api.prepareUpdateInstall()).installation.status, "unavailable");
  for (const [outcome, expected] of [["success", "installed"], ["rollback", "rolled-back"], ["recovery", "failed"]]) {
    const { api, flush } = controlledFixture("?view=settings&settings-update=install-ready&install-outcome=" + outcome);
    assert.equal((await api.confirmUpdateInstall()).installation.status, "ready");
    assert.equal((await api.prepareUpdateInstall()).installation.status, "awaiting-confirmation");
    assert.equal((await api.discardUpdate()).downloadedVersion, "0.2.0");
    assert.equal((await api.cancelUpdateInstall()).installation.status, "cancelled");
    await api.prepareUpdateInstall();
    let confirmationFinished = false;
    const confirmation = api.confirmUpdateInstall().then((snapshot) => { confirmationFinished = true; return snapshot; });
    assert.equal((await api.getUpdateState()).installation.status, "waiting-for-exit");
    assert.equal(confirmationFinished, false, "confirmation remains pending while the host waits for exit");
    assert.equal((await api.cancelUpdateInstall()).installation.status, "cancelled");
    assert.equal((await confirmation).installation.status, "cancelled", "cancel resolves the original pending request");
    flush();
    assert.equal((await api.getUpdateState()).installation.status, "cancelled", "cancel clears queued simulation transitions");
    await api.prepareUpdateInstall();
    const execution = api.confirmUpdateInstall();
    flush();
    assert.equal((await execution).installation.status, expected);
    const result = await api.getUpdateState();
    assert.equal(result.installation.status, expected);
    assert.equal(result.fixture, true);
    assert.equal(result.currentVersion, "0.1.0", "file activation is not verified host startup");
  }
});

test("fixture check, cancel, corruption and retry show observable safe states", async () => {
  const { api, flush } = controlledFixture("?view=settings&settings-update=idle&update-outcome=corrupt-first");
  const changes = [];
  const unsubscribe = api.onUpdateStateChanged((snapshot) => changes.push(snapshot));
  assert.equal((await api.checkForUpdates()).status, "checking");
  flush();
  assert.equal((await api.getUpdateState()).status, "available");
  assert.equal((await api.downloadUpdate()).status, "downloading");
  assert.equal((await api.cancelUpdate()).status, "cancelled");
  flush();
  assert.equal((await api.getUpdateState()).status, "cancelled");
  await api.downloadUpdate();
  flush();
  assert.equal((await api.getUpdateState()).status, "downloaded");
  assert.equal((await api.getUpdateState()).currentVersion, "0.1.0");
  assert.ok(changes.every((snapshot) => snapshot.fixture === true));
  unsubscribe();
  const retry = controlledFixture("?view=settings&settings-update=available&update-outcome=corrupt-first");
  await retry.api.downloadUpdate(); retry.flush();
  assert.equal((await retry.api.getUpdateState()).error.code, "checksum");
  await retry.api.downloadUpdate(); retry.flush();
  assert.equal((await retry.api.getUpdateState()).status, "downloaded");
});
