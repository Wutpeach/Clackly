import assert from "node:assert/strict";
import path from "node:path";
import { SETTINGS_UPDATE_SCENARIOS } from "../electron/renderer/settingsUpdateFixture.mjs";
import { translate } from "../localization/resources.mjs";

export const SETTINGS_UPDATE_EVIDENCE_SCENARIOS = Object.freeze([
  ...["en", "zh"].flatMap((locale) => SETTINGS_UPDATE_SCENARIOS.map((state) => 'settings-update-' + state + '-' + locale)),
  ...["en", "zh"].flatMap((locale) => ["keyboard", "candidate-flow", "install-flow", "rollback-flow", "recovery-flow"].map((flow) => 'settings-update-' + flow + '-' + locale))
]);

export async function runSettingsUpdateEvidence(name, { browser, serverUrl, output, evidence, checks, captureScreenshots = true }) {
  const locale = name.endsWith("-zh") ? "zh-CN" : "en";
  const state = name.slice("settings-update-".length, name.lastIndexOf("-"));
  const t = (key) => translate(locale, 'settings.update.' + key);
  const context = await browser.newContext({ viewport: { width: 760, height: 560 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  const url = new URL(serverUrl);
  url.searchParams.set("view", "settings");
  url.searchParams.set("settings-preview", "application-empty");
  const installationStates = { "install-ready": "ready", confirmation: "awaiting-confirmation", "waiting-exit": "waiting-for-exit",
    installing: "installing", installed: "installed", "rolled-back": "rolled-back", "install-failed": "failed",
    "install-cancelled": "cancelled", "permission-denied": "unavailable", "permission-cancelled": "cancelled",
    "recovery-required": "failed", "publisher-unverified": "unavailable" };
  const workflow = state.endsWith("-flow");
  url.searchParams.set("settings-update", state === "keyboard" ? "idle" : state === "candidate-flow" ? "downloaded" : workflow ? "install-ready" : state);
  if (state === "candidate-flow") url.searchParams.set("update-check", "newer");
  if (state === "rollback-flow") url.searchParams.set("install-outcome", "rollback");
  if (state === "recovery-flow") url.searchParams.set("install-outcome", "recovery");
  url.searchParams.set("locale", locale);
  const screenshot = async (suffix = "") => {
    if (!captureScreenshots) return;
    const target = path.join(output, name + suffix + '.png');
    await page.screenshot({ path: target });
    evidence.push(target);
  };
  const section = page.locator(".settings-update");
  const waitStatus = async (status) => {
    await page.waitForFunction((expected) => document.querySelector(".settings-update")?.dataset.updateStatus === expected, status);
  };
  const focused = async (locator, message) => assert.equal(await locator.evaluate((el) => el === document.activeElement), true, message);
  const waitInstallation = async (status) => {
    await page.waitForFunction((expected) => document.querySelector(".settings-update")?.dataset.installationStatus === expected, status);
  };
  try {
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await section.waitFor();
    await page.waitForFunction((language) => document.documentElement.lang === language, locale);
    assert.equal(await page.evaluate(() => Boolean(window.resolveCommandCenter)), false, "hostless simulations have no Electron bridge");
    assert.equal(await page.locator(".update-fixture-label").innerText(), t("fixture"));
    assert.equal(await page.getByRole("heading", { name: t("title"), exact: true }).count(), 1);
    const check = page.getByRole("button", { name: t("check"), exact: true });
    const download = page.getByRole("button", { name: t("download"), exact: true });
    if (state === "candidate-flow") {
      await waitStatus("downloaded");
      assert.equal(await section.getByRole("button", { name: t("install.prepare"), exact: true }).count(), 0, "unqualified candidate has no usable install control");
      await check.focus(); await page.keyboard.press("Enter");
      await waitStatus("checking"); await waitStatus("available");
      assert.deepEqual(await section.locator(".update-versions dd").allTextContents(), ["0.1.0", "0.3.0", "0.2.0"], "real fixture recheck discovers newer while retaining old candidate");
      assert.equal(await download.getAttribute("aria-disabled"), "true");
      await download.click({ force: true });
      assert.equal(await section.locator(".update-versions dd").last().innerText(), "0.2.0", "disabled download cannot replace candidate");
      await screenshot("-retained");
      const discard = section.getByRole("button", { name: t("discard"), exact: true });
      await discard.focus(); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelectorAll(".update-versions dd").length === 2);
      await focused(check, "discard returns focus to stable check button");
      await download.focus(); await page.keyboard.press("Enter");
      await waitStatus("downloaded");
      assert.deepEqual(await section.locator(".update-versions dd").allTextContents(), ["0.1.0", "0.3.0", "0.3.0"]);
      checks.push(name + ': manual recheck discovers 0.3.0 and retains 0.2.0; only explicit keyboard discard enables replacement, without changing installed identity.');
    } else if (workflow) {
      await waitInstallation("ready");
      const prepare = section.getByRole("button", { name: t("install.prepare"), exact: true });
      const cancelConfirm = section.getByRole("button", { name: t("install.cancel"), exact: true });
      const confirm = section.getByRole("button", { name: t("install.confirm"), exact: true });
      await prepare.focus(); await page.keyboard.press("Enter");
      await waitInstallation("awaiting-confirmation");
      await focused(cancelConfirm, "confirmation initially focuses the safe cancellation action");
      assert.equal(await section.locator("#update-confirm-facts").innerText(), t("install.confirmFacts"));
      assert.equal(await check.getAttribute("aria-disabled"), "true");
      await screenshot("-confirmation");
      await page.keyboard.press("Escape"); await waitInstallation("cancelled");
      await focused(prepare, "Escape returns focus to prepare without closing Settings");
      await page.keyboard.press("Enter"); await waitInstallation("awaiting-confirmation");
      await focused(cancelConfirm, "second confirmation restores cancellation focus");
      await page.keyboard.press("Enter"); await waitInstallation("cancelled");
      await focused(prepare, "explicit Not Now returns focus to prepare");
      await page.keyboard.press("Enter"); await waitInstallation("awaiting-confirmation");
      await page.keyboard.press("Tab"); await focused(confirm, "Tab reaches explicit confirmation");
      await page.keyboard.press("Space"); await waitInstallation("waiting-for-exit");
      await focused(check, "confirmation completion leaves focus on a stable control");
      const cancelWait = section.getByRole("button", { name: t("install.cancelWait"), exact: true });
      assert.equal(await cancelWait.getAttribute("aria-disabled"), "false", "cancel remains available while confirmation IPC is pending");
      await cancelWait.focus(); await page.keyboard.press("Enter"); await waitInstallation("cancelled");
      await page.waitForTimeout(900); await waitInstallation("cancelled");
      await prepare.focus(); await page.keyboard.press("Enter"); await waitInstallation("awaiting-confirmation");
      await confirm.focus(); await page.keyboard.press("Enter"); await waitInstallation("waiting-for-exit");
      await screenshot("-waiting");
      await waitInstallation("installing");
      assert.equal(await section.getByRole("button", { name: t("install.cancelWait"), exact: true }).count(), 0, "cannot cancel a directory switch");
      assert.equal(await section.locator(".update-install-status").innerText(), t("install.status.installing"));
      assert.equal(await check.getAttribute("aria-disabled"), "true");
      await screenshot("-installing");
      const expected = state === "rollback-flow" ? "rolled-back" : state === "recovery-flow" ? "failed" : "installed";
      await waitInstallation(expected);
      assert.equal(await section.locator(".update-install-status").innerText(), t('install.status.' + expected));
      if (state === "recovery-flow") assert.equal(await section.locator(".update-install-reason").innerText(), t("install.reason.recovery-required"));
      assert.equal(await section.locator(".update-versions dd").first().innerText(), "0.1.0", "activation simulation cannot verify host startup");
      checks.push(name + ': keyboard confirmation, Escape/Not Now and wait cancellation retain candidate; simulated waiting/installing/' + expected + ' states remain explicitly non-executable.');
    } else if (state === "keyboard") {
      await check.focus();
      await page.keyboard.press("Enter");
      await waitStatus("checking");
      await focused(check, "Check keeps keyboard focus during checking");
      assert.equal(await check.getAttribute("aria-disabled"), "true");
      await waitStatus("available");
      await focused(check, "Check completion keeps keyboard focus");
      await page.keyboard.press("Tab");
      await focused(download, "Tab reaches the Download action");
      await page.keyboard.press("Space");
      await waitStatus("downloading");
      await focused(download, "Download retains focus while unavailable for reactivation");
      await page.keyboard.press("Tab");
      const cancel = page.getByRole("button", { name: t("cancel"), exact: true });
      await focused(cancel, "Cancel remains reachable while download runs");
      await page.keyboard.press("Enter");
      await waitStatus("cancelled");
      await focused(check, "Removed Cancel returns focus to the stable Check control");
      await screenshot("-cancelled");
      // Independent second simulation proves a corrupt completion followed by a clean retry.
      url.searchParams.set("settings-update", "available");
      url.searchParams.set("update-outcome", "corrupt-first");
      await page.goto(url.toString(), { waitUntil: "networkidle" });
      await waitStatus("available");
      await download.focus(); await page.keyboard.press("Enter");
      await waitStatus("error");
      assert.equal(await section.locator(".update-status").innerText(), t("error.corrupt"));
      const retry = page.getByRole("button", { name: t("retryDownload"), exact: true });
      await focused(retry, "Failure changes the label without replacing the focused action");
      await screenshot("-corrupt");
      await page.keyboard.press("Enter");
      await waitStatus("downloaded");
      assert.equal(await section.locator(".update-status").first().innerText(), t("status.downloaded"));
      await focused(download, "Verified completion preserves the original Download element");
      assert.equal(await download.getAttribute("aria-disabled"), "true");
      assert.equal(await section.locator(".update-versions dd").first().innerText(), "0.1.0", "downloading does not change installed version");
      assert.equal(await section.getByRole("button").count(), 3, "only check, unavailable download and explicit discard exist for an unqualified candidate");
      const notes = section.locator(".update-release-notes");
      await notes.focus(); await page.keyboard.press("Control+a");
      assert.ok((await page.evaluate(() => window.getSelection().toString())).length > 0, "release notes remain selectable");
      checks.push(name + ': check/download/cancel/corruption/retry/downloaded keyboard transitions retain focus and leave installed version unchanged; all outcomes are labeled simulations.');
    } else {
      const expected = installationStates[state] ? "downloaded" : ["rate-limit", "offline", "timeout", "failure", "corrupt", "space", "version"].includes(state) ? "error" : state;
      await waitStatus(expected);
      const errors = { "rate-limit": "rateLimit", offline: "offline", timeout: "timeout", failure: "path", corrupt: "corrupt", space: "space", version: "version", unavailable: "installedVersion" };
      assert.equal(await section.locator(".update-status").first().innerText(), t(errors[state] ? 'error.' + errors[state] : 'status.' + expected));
      if (installationStates[state]) {
        await waitInstallation(installationStates[state]);
        assert.equal(await section.locator(".update-install-status").innerText(), t('install.status.' + installationStates[state]));
        assert.equal(await download.getAttribute("aria-disabled"), "true");
      }
      if (["checking", "downloading", "verifying", "rate-limit", "unavailable"].includes(state)) assert.equal(await check.getAttribute("aria-disabled"), "true");
      if (state === "rate-limit") assert.equal(await section.locator(".update-retry").count(), 1);
      if (state === "no-release") assert.equal(await section.locator(".update-versions dd").last().innerText(), t("notChecked"));
      if (state === "available") assert.equal(await download.getAttribute("aria-disabled"), "false");
      if (state === "downloading") {
        assert.equal(await section.getByRole("progressbar").getAttribute("value"), "40");
        assert.equal(await section.getByRole("progressbar").getAttribute("aria-live"), null, "progress changes are not a separate live announcement stream");
      }
      if (state === "downloaded") assert.equal(await download.getAttribute("aria-disabled"), "true");
      checks.push(name + ': bilingual state, safe controlled feedback and bounded controls verified in a hostless labeled simulation.');
    }
    const metrics = await section.evaluate((el) => {
      const scroll = el.closest(".settings-configuration-scroll");
      return { surface: getComputedStyle(document.querySelector(".settings-shell")).backgroundColor,
        overflowing: scroll.scrollWidth > scroll.clientWidth, textNodes: el.querySelectorAll("pre > *").length,
        notesHeight: el.querySelector("pre")?.clientHeight || 0 };
    });
    assert.equal(metrics.overflowing, false, "update content stays within existing Settings detail width");
    assert.equal(metrics.surface, "rgb(21, 22, 25)", "incumbent Settings surface is preserved");
    assert.equal(metrics.textNodes, 0, "release notes are plain text");
    assert.ok(metrics.notesHeight <= 104, "release notes scrolling is bounded");
    assert.deepEqual(problems, [], "no browser console or page errors");
    await screenshot();
  } finally { await context.close(); }
}
