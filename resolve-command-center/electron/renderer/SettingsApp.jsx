import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import SettingsUpdateSection from "./SettingsUpdateSection.jsx";
import SettingsExtensions from "./SettingsExtensions.jsx";
import SettingsRenderer from "./SettingsRenderer.jsx";
import LanguageSelect from "./LanguageSelect.jsx";
import InteractionInput from "./InteractionInput.jsx";
import { useLocalization } from "./LocalizationContext.jsx";
import { localizeCommands, localizeFeatureMetadata, presentError } from "../../localization/presentation.mjs";
import {
  filterFeaturesByQuery,
  getEffectiveFeatureStatus,
  getFeatureWarning,
  getInteractionHelpCommands,
  groupFeaturesByCategory,
  isFeatureVisible,
  joinFeatureStatuses
} from "./model.mjs";

function mergeStatuses(current, next) {
  const updates = Array.isArray(next) ? next : [next];
  const byId = new Map(current.map((record) => [record.id, record]));
  updates.forEach((record) => byId.set(record.id, record));
  return [...byId.values()];
}

function SettingsTitlebar({ onClose, Icon, t }) {
  return (
    <header className="settings-titlebar">
      <div className="settings-titlebar-drag">
        <span className="settings-titlebar-label">{t("settings.label")}</span>
      </div>
      <button
        className="settings-titlebar-close"
        type="button"
        aria-label={t("settings.close")}
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
    </header>
  );
}

function formatProviderName(provider) {
  return String(provider || "")
    .trim()
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase() === "api" ? "API" : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function presentSettingsOperationError(error, t, operation) {
  const knownMessage = presentError(error, t);
  return knownMessage === t("error.generic") ? t(`settings.error.${operation}`) : knownMessage;
}

function Feedback({ status, t }) {
  const message = status?.messageKey ? t(status.messageKey) : status?.message;
  return (
    <div
      className={status?.kind === "error" ? "settings-feedback error" : "settings-feedback"}
      role={status?.kind === "error" ? "alert" : "status"}
      aria-live="polite"
      title={message || undefined}
    >
      {message}
    </div>
  );
}

function SettingsConfirmation({ title, description, content, onCancel, children, busy, t }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    element.querySelector("[data-cancel]").focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-dialog-title"
      aria-describedby="settings-dialog-description" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="settings-dialog-title">{title}</h2>
      <p id="settings-dialog-description">{description}</p>
      {content}
      <div className="settings-dialog-actions">
        <button type="button" className="secondary-button" data-cancel disabled={busy} onClick={onCancel}>{t("settings.cancel")}</button>
        {children}
      </div>
    </dialog>
  );
}

function ConfigurationActions({ disabled, onClear, t }) {
  const popup = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({});
  useEffect(() => {
    const element = popup.current;
    const sync = () => setOpen(element.matches(":popover-open"));
    element.addEventListener("toggle", sync);
    return () => element.removeEventListener("toggle", sync);
  }, []);
  return (
    <>
      <button ref={trigger} type="button" className="secondary-button configuration-more"
        aria-label={t("settings.configurationActions")} title={t("settings.configurationActions")}
        aria-expanded={open} aria-controls="configuration-actions" disabled={disabled}
        onClick={() => {
          if (open) { popup.current.hidePopover(); return; }
          const rect = trigger.current.getBoundingClientRect();
          popup.current.showPopover();
          const { width, height } = popup.current.getBoundingClientRect();
          setPosition({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
            top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)) });
          popup.current.firstElementChild.focus();
        }}>
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      <div ref={popup} id="configuration-actions" popover="auto" className="configuration-menu" style={position}
        onKeyDown={(event) => { if (event.key === "Escape") { popup.current.hidePopover(); trigger.current.focus(); } }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) popup.current.hidePopover(); }}>
        <button type="button" onClick={() => { popup.current.hidePopover(); trigger.current.focus(); onClear(); }}>
          {t("settings.clearSaved")}
        </button>
      </div>
    </>
  );
}

function SettingsApp({ api, Icon }) {
  const { effectiveLocale, preference, setLocalePreference, t } = useLocalization();
  const [features, setFeatures] = useState([]);
  const [featureStatuses, setFeatureStatuses] = useState([]);
  const [commands, setCommands] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [extensions, setExtensions] = useState([]);
  const [selectedExtensionId, setSelectedExtensionId] = useState(null);
  const [featureQuery, setFeatureQuery] = useState("");
  const [savedValues, setSavedValues] = useState({});
  const [draftValues, setDraftValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [featureBusy, setBusy] = useState(false);
  const [extensionWorking, setExtensionWorking] = useState(false);
  const busy = featureBusy || extensionWorking;
  const [busyMessageKey, setBusyMessageKey] = useState("settings.working");
  const [status, setStatus] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const busyOperation = useRef(0);
  const actionGuard = useRef(null);
  const allowClose = useRef(false);

  function beginBusyOperation(messageKey = "settings.working") {
    const operation = busyOperation.current + 1;
    busyOperation.current = operation;
    setBusy(true);
    setBusyMessageKey(messageKey);
    return operation;
  }

  function isCurrentBusyOperation(operation) {
    return busyOperation.current === operation;
  }

  function finishBusyOperation(operation) {
    if (!isCurrentBusyOperation(operation)) return;
    setBusy(false);
  }

  function cancelBusyOperation(operation) {
    if (!isCurrentBusyOperation(operation)) return;
    busyOperation.current += 1;
    setBusy(false);
  }

  function completeAction(action) {
    setPendingAction(null);
    setStatus(null);
    if (action.type === "close") {
      allowClose.current = true;
      api.closeSettings();
    } else if (action.type === "extension-operation") action.run();
    else {
      setSelectedFeatureId(action.featureId);
      setSelectedExtensionId(action.extensionId || null);
    }
  }

  const localizedFeatures = useMemo(
    () => features.map((feature) => localizeFeatureMetadata(feature, effectiveLocale)),
    [features, effectiveLocale]
  );
  const localizedCommands = useMemo(() => localizeCommands(commands, effectiveLocale), [commands, effectiveLocale]);
  const visibleFeatures = useMemo(() => joinFeatureStatuses(localizedFeatures, featureStatuses)
    .filter(({ featureStatus }) => isFeatureVisible(featureStatus)), [localizedFeatures, featureStatuses]);
  const filteredFeatures = useMemo(() => filterFeaturesByQuery(visibleFeatures, featureQuery), [visibleFeatures, featureQuery]);
  const groupedFeatures = useMemo(() => groupFeaturesByCategory(filteredFeatures), [filteredFeatures]);
  const extensionsSelected = selectedFeatureId === "extensions";
  const selectedExtension = extensionsSelected ? extensions.find(({ id }) => id === selectedExtensionId) : null;
  const selectedFeature = selectedExtension || visibleFeatures.find(({ id }) => id === selectedFeatureId) || null;
  const extensionConfigKey = selectedExtension ? JSON.stringify([selectedExtension.id, selectedExtension.configSchema, selectedExtension.values]) : null;
  const selectedFeatureFilteredOut = Boolean(
    !extensionsSelected && selectedFeature && featureQuery.trim() && !filteredFeatures.some(({ id }) => id === selectedFeature.id)
  );
  const navigationGroups = useMemo(() => selectedFeatureFilteredOut
    ? [[t("settings.current"), [selectedFeature]], ...groupedFeatures]
    : groupedFeatures, [groupedFeatures, selectedFeature, selectedFeatureFilteredOut, t]);
  const selectedFeatureStatus = selectedFeature?.featureStatus || null;
  const selectedEffectiveStatus = getEffectiveFeatureStatus(selectedFeatureStatus, t);
  const helpCommands = useMemo(() => selectedFeature
    ? getInteractionHelpCommands(localizedCommands, selectedFeature.id, bindings, t)
    : [], [bindings, localizedCommands, selectedFeature, t]);
  const hasSchema = Boolean(selectedFeature && Object.keys(selectedFeature.configSchema).length);
  const hasSavedValues = Object.keys(savedValues).length > 0;
  const applicationSelected = selectedFeatureId === null;
  const hasUnsavedChanges = hasSchema && [...new Set([...Object.keys(savedValues), ...Object.keys(draftValues)])]
    .some((key) => savedValues[key] !== draftValues[key]);
  const feedback = busy ? { messageKey: busyMessageKey }
    : status?.kind === "error" ? status
      : hasUnsavedChanges ? { messageKey: "settings.unsaved" } : status;

  function requestAction(action) {
    if (busy) return;
    if (action.type === "navigate" && action.featureId === selectedFeatureId
      && (action.extensionId || null) === selectedExtensionId) return;
    setConfirmClear(false);
    if (hasUnsavedChanges) setPendingAction(action);
    else completeAction(action);
  }
  actionGuard.current = { hasUnsavedChanges, busy, requestAction };

  function discardChanges() {
    setDraftValues({ ...savedValues });
    setStatus(null);
  }

  async function saveAndContinue() {
    const action = pendingAction;
    if (!busy && (!hasUnsavedChanges || await save())) completeAction(action);
  }

  useEffect(() => {
    if (!api.listExtensions) return;
    let active = true;
    const refresh = () => api.listExtensions().then((next) => {
      if (!active) return;
      if (actionGuard.current.hasUnsavedChanges) setExtensions((current) => current.map((record) => {
        const updated = next.find(({ id }) => id === record.id);
        return updated ? { ...record, runtimeStatus: updated.runtimeStatus, runtimeError: updated.runtimeError } : record;
      }));
      else setExtensions(next);
    }).catch((error) => { if (active) setStatus({ kind: "error", message: String(error.message) }); });
    refresh();
    const unsubscribe = api.onCommandsChanged?.(refresh);
    return () => { active = false; unsubscribe?.(); };
  }, [api]);

  useEffect(() => {
    const beforeClose = (event) => {
      if (allowClose.current) return;
      if (!actionGuard.current.hasUnsavedChanges && !actionGuard.current.busy) return;
      event.preventDefault();
      event.returnValue = false;
      if (actionGuard.current.busy) return;
      actionGuard.current.requestAction({ type: "close" });
    };
    window.addEventListener("beforeunload", beforeClose);
    return () => window.removeEventListener("beforeunload", beforeClose);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.listFeatures(),
      api.listCommands(),
      api.listInteractionBindings(),
      api.listFeatureStatuses()
    ])
      .then(([nextFeatures, nextCommands, nextBindings, nextStatuses]) => {
        if (!active) return null;
        setFeatures(nextFeatures);
        setCommands(nextCommands);
        setBindings(nextBindings);
        setFeatureStatuses(nextStatuses);
        setSelectedFeatureId((current) => (
          typeof current === "string" && nextFeatures.some(({ id }) => id === current) ? current : null
        ));
        return api.refreshFeatureStatuses();
      })
      .then((nextStatuses) => {
        if (active && nextStatuses) setFeatureStatuses(nextStatuses);
      })
      .catch((error) => {
        if (active) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "load") });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    document.title = t("settings.title");
  }, [t]);

  useEffect(() => api.onSettingsFeatureSelected((featureId) => {
    if (typeof featureId === "string") actionGuard.current.requestAction({ type: "navigate", featureId });
  }), [api]);

  useEffect(() => {
    if (!loading && selectedFeatureId !== null && selectedFeatureId !== "extensions" && !visibleFeatures.some(({ id }) => id === selectedFeatureId)) {
      setSelectedFeatureId(null);
    }
  }, [loading, selectedFeatureId, visibleFeatures]);

  useEffect(() => {
    if (!selectedFeature) return undefined;
    let active = true;
    const operation = beginBusyOperation("settings.loadingConfig");
    setStatus(null);
    setSavedValues({});
    setDraftValues({});
    (selectedExtension ? Promise.resolve(selectedExtension.values) : api.getConfig(selectedFeature.id))
      .then((values) => {
        if (!active || !isCurrentBusyOperation(operation)) return;
        setSavedValues(values);
        setDraftValues(values);
      })
      .catch((error) => {
        if (active && isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "configLoad") });
      })
      .finally(() => {
        if (active) finishBusyOperation(operation);
      });
    return () => {
      active = false;
      cancelBusyOperation(operation);
    };
  }, [api, selectedFeature?.id, extensionConfigKey]);

  function updateDraft(key, value) {
    setStatus(null);
    setDraftValues((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function pickPath(type) {
    try {
      const picked = await api.pickPath(type);
      if (picked === null) setStatus({ kind: "neutral", message: t("settings.selectionCancelled") });
      return picked;
    } catch (error) {
      setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "pathPicker") });
      return null;
    }
  }

  async function save() {
    if (!selectedFeature || busy || !hasSchema || !hasUnsavedChanges) return false;
    const operation = beginBusyOperation("settings.saving");
    setStatus(null);
    try {
      const values = selectedExtension
        ? await api.saveExtensionConfig(selectedFeature.id, draftValues)
        : await api.saveConfig(selectedFeature.id, draftValues);
      if (!isCurrentBusyOperation(operation)) return false;
      setSavedValues(values);
      setDraftValues(values);
      try {
        if (selectedExtension) {
          setExtensions(await api.listExtensions());
          setStatus({ kind: "success", messageKey: "settings.saved" });
          return true;
        }
        const nextStatus = await api.refreshFeatureStatuses(selectedFeature.id);
        if (!isCurrentBusyOperation(operation)) return false;
        setFeatureStatuses((current) => mergeStatuses(current, nextStatus));
        setStatus({ kind: "success", messageKey: "settings.saved" });
      } catch {
        if (isCurrentBusyOperation(operation)) setStatus({ messageKey: "settings.savedStatusUnavailable" });
      }
      return true;
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "save") });
      return false;
    } finally {
      finishBusyOperation(operation);
    }
  }

  async function clearSavedConfiguration() {
    if (!selectedFeature || busy || !hasSavedValues) return;
    const operation = beginBusyOperation("settings.clearing");
    setStatus(null);
    try {
      const values = await api.resetConfig(selectedFeature.id);
      if (!isCurrentBusyOperation(operation)) return;
      setSavedValues(values);
      setDraftValues(values);
      setConfirmClear(false);
      try {
        const nextStatus = await api.refreshFeatureStatuses(selectedFeature.id);
        if (!isCurrentBusyOperation(operation)) return;
        setFeatureStatuses((current) => mergeStatuses(current, nextStatus));
        setStatus({ kind: "success", messageKey: "settings.cleared" });
      } catch {
        if (isCurrentBusyOperation(operation)) setStatus({ messageKey: "settings.clearedStatusUnavailable" });
      }
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "reset") });
    } finally {
      finishBusyOperation(operation);
    }
  }

  async function setEnabled(enabled) {
    if (!selectedFeature || busy) return;
    const operation = beginBusyOperation();
    setStatus(null);
    try {
      const next = await api.setFeatureEnabled(selectedFeature.id, enabled);
      if (!isCurrentBusyOperation(operation)) return;
      setFeatureStatuses((current) => mergeStatuses(current, next));
      setStatus({ kind: "success", message: t(enabled ? "settings.enabled" : "settings.disabled") });
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, enabled ? "enable" : "disable") });
    } finally {
      finishBusyOperation(operation);
    }
  }

  async function refreshStatus() {
    if (!selectedFeature || busy) return;
    const operation = beginBusyOperation();
    setStatus(null);
    try {
      const next = await api.refreshFeatureStatuses(selectedFeature.id);
      if (!isCurrentBusyOperation(operation)) return;
      setFeatureStatuses((current) => mergeStatuses(current, next));
      setStatus({ kind: "success", message: t("settings.refreshed") });
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "refresh") });
    } finally {
      finishBusyOperation(operation);
    }
  }

  async function changeLocale(value) {
    if (busy) return;
    const operation = beginBusyOperation();
    setStatus(null);
    try {
      await setLocalePreference(value);
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "success", messageKey: "settings.saved" });
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "locale") });
    } finally {
      finishBusyOperation(operation);
    }
  }

  if (loading) {
    return (
      <main className="settings-shell">
        <SettingsTitlebar onClose={() => requestAction({ type: "close" })} Icon={Icon} t={t} />
        <div className="settings-state" role="status">{t("settings.loading")}</div>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <SettingsTitlebar onClose={() => requestAction({ type: "close" })} Icon={Icon} t={t} />
      <div className="settings-workspace">
        <aside className="feature-sidebar" aria-label={t("settings.features")}>
          <label className="feature-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={featureQuery}
              onChange={(event) => setFeatureQuery(event.target.value)}
              aria-label={t("settings.searchFeatures")}
              placeholder={t("settings.searchFeatures.placeholder")}
            />
          </label>
          <nav className="feature-navigation" aria-label={t("settings.features")}>
            <div className="application-navigation">
              <button
                type="button"
                className={applicationSelected ? "feature-button selected" : "feature-button"}
                aria-current={applicationSelected ? "page" : undefined}
                onClick={() => requestAction({ type: "navigate", featureId: null })}
              >
                <Icon name="settings" size={16} />
                <span>{t("settings.application")}</span>
              </button>
            </div>
            <div className="extensions-navigation">
              <button type="button" className={extensionsSelected ? "feature-button selected" : "feature-button"}
                aria-current={extensionsSelected ? "page" : undefined}
                onClick={() => requestAction({ type: "navigate", featureId: "extensions" })}>
                <Icon name="command" size={16} /><span>{t("extensions.title")}</span>
              </button>
            </div>
            {navigationGroups.map(([category, categoryFeatures], categoryIndex) => (
              <section
                className={selectedFeatureFilteredOut && categoryIndex === 0 ? "feature-category feature-current-category" : "feature-category"}
                key={category}
                aria-labelledby={`feature-category-${categoryIndex}`}
              >
                <h2 id={`feature-category-${categoryIndex}`}>{category}</h2>
                {categoryFeatures.map((feature) => {
                  const warning = getFeatureWarning(feature.featureStatus, t);
                  const descriptionId = `feature-status-${feature.id.replace(/[^a-z0-9_-]/gi, "-")}`;
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      className={feature.id === selectedFeatureId ? "feature-button selected" : "feature-button"}
                      aria-current={feature.id === selectedFeatureId ? "page" : undefined}
                      aria-describedby={warning ? descriptionId : undefined}
                      title={[feature.name, warning?.message].filter(Boolean).join(" — ")}
                      onClick={() => requestAction({ type: "navigate", featureId: feature.id })}
                    >
                      <Icon name={feature.icon} size={16} />
                      <span>{feature.name}</span>
                      {warning && (
                        <span
                          className={warning.kind === "loading" ? "feature-status-indicator loading" : "feature-status-indicator"}
                          aria-hidden="true"
                        >
                          <Icon name={warning.kind === "loading" ? "loading" : "warning"} size={14} />
                        </span>
                      )}
                      {warning && <span id={descriptionId} className="feature-status-tooltip" role="tooltip">{warning.message}</span>}
                    </button>
                  );
                })}
              </section>
            ))}
            {featureQuery.trim() && filteredFeatures.length === 0 && (
              <p className="feature-search-empty" role="status">{t("settings.searchEmpty")}</p>
            )}
            {!featureQuery.trim() && visibleFeatures.length === 0 && (
              <p className="feature-search-empty" role="status">{t("settings.none.detail")}</p>
            )}
          </nav>
        </aside>

        <section className="settings-configuration" aria-labelledby={extensionsSelected ? "extensions-title" : applicationSelected ? "application-title" : "feature-title"}>
          <div className="settings-configuration-scroll" key={selectedFeatureId ?? "application"}>
            {extensionsSelected ? <SettingsExtensions api={api} t={t} extensions={extensions}
              selected={selectedExtension} busy={busy} onBusyChange={setExtensionWorking} onSelect={(extensionId) => requestAction({ type: "navigate", featureId: "extensions", extensionId })}
              onOperation={(run) => requestAction({ type: "extension-operation", run })}
              onChanged={async () => setExtensions(await api.listExtensions())} Confirmation={SettingsConfirmation}>
              <SettingsRenderer schema={selectedExtension?.configSchema || {}} values={draftValues}
                onChange={updateDraft} onPick={pickPath} t={t} disabled={busy} />
            </SettingsExtensions> : applicationSelected ? (
              <>
                <header className="settings-configuration-header">
                  <span className="settings-configuration-icon" aria-hidden="true"><Icon name="settings" size={16} /></span>
                  <h1 id="application-title">{t("settings.application")}</h1>
                </header>
                <section className="settings-section general-settings" aria-labelledby="language-heading">
                  <div className="settings-fields">
                    <div className="settings-field">
                      <label id="language-heading" htmlFor="locale-preference">{t("settings.language")}</label>
                      <LanguageSelect id="locale-preference" labelId="language-heading" value={preference}
                        disabled={busy} onChange={changeLocale} options={[
                          { value: "system", label: t("settings.language.system") },
                          { value: "en", label: t("settings.language.en") },
                          { value: "zh-CN", label: t("settings.language.zh-CN") }
                        ]} />
                    </div>
                  </div>
                </section>
                <SettingsUpdateSection api={api} />
              </>
            ) : selectedFeature && (
              <>
                <header className="settings-configuration-header">
                  <span className="settings-configuration-icon" aria-hidden="true"><Icon name={selectedFeature.icon} size={16} /></span>
                  <div>
                    <span className="feature-category-label">{selectedFeature.category}</span>
                    <h1 id="feature-title">{selectedFeature.name}</h1>
                  </div>
                </header>
                <p className="inspector-description settings-introduction">{selectedFeature.description}</p>
                <section className="settings-section feature-status-section" aria-label={t("settings.status")}>
                  <div className="feature-status-line">
                    <p className={'feature-effective-status ' + selectedEffectiveStatus.kind}>
                      {selectedEffectiveStatus.kind === "ready" && <span className="feature-ready-dot" aria-hidden="true" />}
                      {selectedEffectiveStatus.label}
                    </p>
                    <div className="inspector-actions">
                      <button type="button" className="secondary-button" disabled={busy} onClick={refreshStatus}>
                        <Icon name="refresh" size={14} /><span>{t("settings.refresh")}</span>
                      </button>
                      <button type="button" className="secondary-button" disabled={busy}
                        onClick={() => setEnabled(!selectedFeatureStatus?.enabled)}>
                        <Icon name="power" size={14} />
                        <span>{selectedFeatureStatus?.enabled ? t("settings.disable") : t("settings.enable")}</span>
                      </button>
                    </div>
                  </div>
                  {selectedEffectiveStatus.reason && <p className="feature-status-reason">{selectedEffectiveStatus.reason}</p>}
                </section>
                <section className="settings-section" aria-labelledby={hasSchema ? "settings-heading" : undefined}>
                  {hasSchema && <div className="configuration-heading">
                    <h2 id="settings-heading">{t("settings.configuration")}</h2>
                    <ConfigurationActions disabled={busy || !hasSavedValues} onClear={() => { setStatus(null); setConfirmClear(true); }} t={t} />
                  </div>}
                  <SettingsRenderer schema={selectedFeature.configSchema} values={draftValues}
                    onChange={updateDraft} onPick={pickPath} t={t} disabled={busy} />
                </section>
                <section className="settings-section" aria-labelledby="feature-interaction-heading">
                  <h2 id="feature-interaction-heading">{t("settings.interaction")}</h2>
                  {helpCommands.length === 0 ? (
                    <p className="settings-empty-copy">{t("settings.noInteractionHelp")}</p>
                  ) : helpCommands.map((command) => (
                    <div className="inspector-interaction-command" key={command.id}>
                      {helpCommands.length > 1 && <h3>{command.name}</h3>}
                      {command.help.map((entry, index) => (
                        <div className="inspector-interaction-row" key={entry.label + '-' + index} aria-label={t("interaction.rowAria", entry)}>
                          <InteractionInput label={entry.label} trigger={entry.trigger} className="inspector-interaction-input" />
                          <span className="inspector-interaction-action-name">{entry.actionName}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
                {(selectedFeature.version || selectedFeature.providers?.length > 0) && (
                  <dl className="inspector-metadata">
                    {selectedFeature.version && <div><dt>{t("settings.version")}</dt><dd>{selectedFeature.version}</dd></div>}
                    {selectedFeature.providers?.length > 0 && <div><dt>{t("settings.providers")}</dt><dd>{selectedFeature.providers.map(formatProviderName).filter(Boolean).join(", ")}</dd></div>}
                  </dl>
                )}
              </>
            )}
          </div>
        </section>
      </div>
      <footer className="settings-actions">
        <Feedback status={feedback} t={t} />
        {hasSchema && (
          <>
            <button type="button" className="secondary-button" disabled={busy || !hasUnsavedChanges} onClick={discardChanges}>
              {t("settings.discard")}
            </button>
            <button type="button" className="primary-button" disabled={busy || !hasUnsavedChanges} onClick={save}>
              {t("settings.saveChanges")}
            </button>
          </>
        )}
      </footer>
      {pendingAction && <SettingsConfirmation title={t("settings.leave.title")}
        description={t("settings.leave.description", { name: selectedFeature?.name || "" })}
        onCancel={() => { if (!busy) setPendingAction(null); }} busy={busy} t={t}>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => { discardChanges(); completeAction(pendingAction); }}>{t("settings.discard")}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={saveAndContinue}>{t("settings.saveContinue")}</button>
        {status?.kind === "error" && <Feedback status={status} t={t} />}
      </SettingsConfirmation>}
      {confirmClear && <SettingsConfirmation title={t("settings.clear.title")}
        description={t("settings.clear.description", { name: selectedFeature?.name || "" })}
        onCancel={() => { if (!busy) setConfirmClear(false); }} busy={busy} t={t}>
        <button type="button" className="secondary-button" disabled={busy} onClick={clearSavedConfiguration}>{t("settings.clearConfirm")}</button>
        {status?.kind === "error" && <Feedback status={status} t={t} />}
      </SettingsConfirmation>}
    </main>
  );
}

export default SettingsApp;
