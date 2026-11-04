import React, { useEffect, useRef, useState } from "react";
import { useLocalization } from "./LocalizationContext.jsx";
import { getUpdatePresentation, normalizeUpdateSnapshot, unavailableUpdateSnapshot } from "./updatePresentation.mjs";

export default function SettingsUpdateSection({ api }) {
  const { effectiveLocale, t } = useLocalization();
  const [state, setState] = useState(unavailableUpdateSnapshot);
  const [pending, setPending] = useState([]);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(false);
  const pendingIntents = useRef(new Set());
  const checkButton = useRef(null);
  const downloadButton = useRef(null);
  const focusAfterDownload = useRef(false);
  const cancelButton = useRef(null);
  const installButton = useRef(null);
  const confirmationCancel = useRef(null);
  const section = useRef(null);
  const returnAfterConfirmation = useRef(false);
  const previousInstallationStatus = useRef(null);
  const focusAfterCancel = useRef(false);
  const presentation = getUpdatePresentation(state, now);
  const busy = pending.length > 0;
  const cancellationPending = pending.includes('cancelUpdateInstall');
  const showDownload = Boolean(state.latestVersion && !state.downloadedVersion);
  const installationFeedback = Boolean(state.downloadedVersion &&
    !["ready", "awaiting-confirmation"].includes(state.installation.status) && !state.error && state.status !== "checking");
  const statusKey = installationFeedback
    ? presentation.installationReasonKey || presentation.installationKey
    : state.status === "idle" || state.installation.status === "awaiting-confirmation" ? null : presentation.statusKey;

  useEffect(() => {
    mounted.current = true;
    let eventReceived = false;
    const apply = (snapshot) => {
      if (!mounted.current) return;
      if (document.activeElement === cancelButton.current && !["downloading", "verifying"].includes(snapshot?.status)) {
        focusAfterCancel.current = true;
      }
      if (snapshot?.downloadedVersion && document.activeElement === downloadButton.current) focusAfterDownload.current = true;
      setState(normalizeUpdateSnapshot(snapshot));
      setNow(Date.now());
    };
    const unsubscribe = api.onUpdateStateChanged?.((snapshot) => { eventReceived = true; apply(snapshot); });
    Promise.resolve().then(() => api.getUpdateState?.())
      .then((snapshot) => { if (!eventReceived) apply(snapshot); })
      .catch(() => { if (!eventReceived) apply(unavailableUpdateSnapshot()); });
    return () => { mounted.current = false; unsubscribe?.(); };
  }, [api]);

  useEffect(() => {
    if (focusAfterCancel.current && !presentation.canCancel) {
      focusAfterCancel.current = false;
      checkButton.current?.focus();
    }
  }, [presentation.canCancel, state.installation.status]);

  useEffect(() => {
    const status = state.installation.status;
    if (status === "awaiting-confirmation" && previousInstallationStatus.current !== status) {
      confirmationCancel.current?.focus();
    } else if (previousInstallationStatus.current === "awaiting-confirmation" &&
      (returnAfterConfirmation.current || section.current?.contains(document.activeElement))) {
      returnAfterConfirmation.current = false;
      (installButton.current || checkButton.current)?.focus();
    }
    previousInstallationStatus.current = status;
  }, [state.installation.status]);

  useEffect(() => {
    if (!state.retryAt || state.retryAt <= now) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(state.retryAt - now + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [state.retryAt, now]);

  useEffect(() => {
    if (!showDownload && focusAfterDownload.current) {
      focusAfterDownload.current = false;
      (installButton.current || checkButton.current)?.focus();
    }
  }, [showDownload]);

  async function invoke(intent, enabled) {
    const cancelling = ["cancelUpdate", "cancelUpdateInstall"].includes(intent);
    if (!enabled || pendingIntents.current.has(intent) || (pendingIntents.current.size > 0 && !cancelling) || typeof api[intent] !== "function") return;
    pendingIntents.current.add(intent);
    setPending([...pendingIntents.current]);
    try {
      const snapshot = await api[intent]();
      if (snapshot?.downloadedVersion && document.activeElement === downloadButton.current) focusAfterDownload.current = true;
      if (mounted.current && snapshot) setState(normalizeUpdateSnapshot(snapshot));
    } catch {
      // Main may already have published the useful state. Refresh rather than expose IPC errors.
      try {
        const snapshot = await api.getUpdateState();
        if (mounted.current) setState(normalizeUpdateSnapshot(snapshot));
      } catch {
        if (mounted.current) setState((current) => ({ ...current, status: "error", error: { code: "check-failed" } }));
      }
    } finally {
      pendingIntents.current.delete(intent);
      if (mounted.current) setPending([...pendingIntents.current]);
      if (mounted.current) setNow(Date.now());
    }
  }

  const date = (value) => new Intl.DateTimeFormat(effectiveLocale, { dateStyle: "short", timeStyle: "short" }).format(value);
  const amount = (value) => new Intl.NumberFormat(effectiveLocale, { maximumFractionDigits: 1 }).format(value / 1_048_576);
  return (
    <section ref={section} className="settings-section settings-update" aria-labelledby="update-heading" data-update-status={state.status} data-installation-status={state.installation.status}>
      <div className="update-heading">
        <h2 id="update-heading">{t("settings.update.title")}</h2>
        {state.fixture && <span className="update-fixture-label" title={t("settings.update.fixture")}>{t("settings.update.preview")}</span>}
      </div>
      {(state.currentVersion || state.latestVersion || state.downloadedVersion) && <dl className="update-versions" title={state.checkedAt ? t("settings.update.checkedAt", { time: date(state.checkedAt) }) : undefined}>
        {state.currentVersion && <div><dt>{t("settings.update.currentVersion")}</dt><dd>{state.currentVersion}</dd></div>}
        {state.latestVersion && <div><dt>{t("settings.update.latestVersion")}</dt><dd>{state.latestVersion}</dd></div>}
        {state.downloadedVersion && <div><dt>{t("settings.update.downloadedVersion")}</dt><dd>{state.downloadedVersion}</dd></div>}
      </dl>}
      <p className={"update-status" + (installationFeedback ? " update-install-status" : "")} role="status" aria-live="polite" aria-atomic="true">{statusKey ? t(statusKey) : ""}</p>
      {state.retryAt && state.retryAt > now && <p className="settings-empty-copy update-retry">{t("settings.update.retryAt", { time: date(state.retryAt) })}</p>}
      {(state.currentVersion || state.downloadedVersion) && <div className="inspector-actions update-actions">
        <button ref={checkButton} type="button" className="secondary-button" aria-disabled={!presentation.canCheck || busy}
          onClick={() => invoke("checkForUpdates", presentation.canCheck)}>{t("settings.update.check")}</button>
        <button ref={downloadButton} type="button" className="secondary-button update-download" hidden={!showDownload} aria-disabled={!presentation.canDownload || busy}
          onClick={() => invoke("downloadUpdate", presentation.canDownload)}>{t(presentation.retryableDownload ? "settings.update.retryDownload" : "settings.update.download")}</button>
        {presentation.canCancel && <button ref={cancelButton} type="button" className="secondary-button" aria-disabled={pending.includes("cancelUpdate")}
          onClick={() => { focusAfterCancel.current = document.activeElement === cancelButton.current; invoke("cancelUpdate", presentation.canCancel); }}>{t("settings.update.cancel")}</button>}
        {state.downloadedVersion && <button type="button" className="secondary-button" aria-disabled={!presentation.canDiscard || busy}
          onClick={() => { checkButton.current?.focus(); invoke("discardUpdate", presentation.canDiscard); }}>{t("settings.update.discard")}</button>}
        {presentation.canPrepareInstall && <button ref={installButton} type="button" className="secondary-button" aria-disabled={busy}
          onClick={() => invoke("prepareUpdateInstall", presentation.canPrepareInstall)}>{t("settings.update.install.prepare")}</button>}
      </div>}
      {presentation.canCancel && <div className="update-progress">
        <progress aria-label={t("settings.update.progress")} max="100" value={presentation.progress ?? undefined} />
        <span aria-hidden="true">{presentation.progress === null ? t("settings.update.received", { received: amount(state.receivedBytes) }) : t("settings.update.transferred", { percent: presentation.progress, received: amount(state.receivedBytes), total: amount(state.totalBytes) })}</span>
      </div>}
      {(presentation.canConfirmInstall || (state.downloadedVersion && state.latestVersion !== state.downloadedVersion && presentation.canDiscard)) && <div className="update-installation">
        {state.downloadedVersion && state.latestVersion && state.latestVersion !== state.downloadedVersion && presentation.canDiscard && <p className="settings-empty-copy update-candidate-help">{t("settings.update.candidateHelp")}</p>}
        {presentation.canConfirmInstall && <div className="update-confirmation" role="group" aria-labelledby="update-confirm-title" aria-describedby="update-confirm-facts"
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); returnAfterConfirmation.current = true; invoke("cancelUpdateInstall", presentation.canCancelInstall); }
          }}>
          <h3 id="update-confirm-title">{t("settings.update.install.confirmTitle", { version: state.downloadedVersion })}</h3>
          <p id="update-confirm-facts" className="settings-empty-copy">{t("settings.update.install.confirmFacts")}</p>
          <div className="inspector-actions update-actions">
            <button ref={confirmationCancel} type="button" className="secondary-button" aria-disabled={cancellationPending}
              onClick={() => { returnAfterConfirmation.current = true; invoke("cancelUpdateInstall", presentation.canCancelInstall); }}>{t("settings.update.install.cancel")}</button>
            <button type="button" className="secondary-button" aria-disabled={busy}
              onClick={() => { returnAfterConfirmation.current = true; invoke("confirmUpdateInstall", presentation.canConfirmInstall); }}>{t("settings.update.install.confirm")}</button>
          </div>
        </div>}
      </div>}
      {state.releaseNotes && <details className="update-release">
        <summary id="update-notes-heading">{t("settings.update.releaseNotes")}</summary>
        <pre tabIndex="0" className="update-release-notes" aria-labelledby="update-notes-heading">{state.releaseNotes}</pre>
      </details>}
    </section>
  );
}
