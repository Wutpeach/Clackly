import React, { useEffect, useMemo, useRef, useState } from "react";
import packageMetadata from "../../package.json";
import SettingsRenderer from "./SettingsRenderer.jsx";
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

function SettingsTitlebar({ api, Icon, t }) {
  return (
    <header className="settings-titlebar">
      <div className="settings-titlebar-drag">
        <span className="settings-titlebar-label">{t("settings.label")}</span>
      </div>
      <button
        className="settings-titlebar-close"
        type="button"
        aria-label={t("settings.close")}
        onClick={api.closeSettings}
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

function InteractionInput({ label }) {
  const tokens = label.split(" + ").filter(Boolean);
  return (
    <span className="inspector-interaction-input" aria-label={label}>
      {tokens.map((token, index) => (
        <React.Fragment key={`${token}-${index}`}>
          {index > 0 && <span className="inspector-interaction-plus" aria-hidden="true">+</span>}
          <kbd aria-hidden="true">{token}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

function Feedback({ status }) {
  return (
    <div
      className={status?.kind === "error" ? "settings-feedback error" : "settings-feedback"}
      role={status?.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {status?.message}
    </div>
  );
}

function SettingsApp({ api, Icon }) {
  const { effectiveLocale, preference, setLocalePreference, t } = useLocalization();
  const [features, setFeatures] = useState([]);
  const [featureStatuses, setFeatureStatuses] = useState([]);
  const [commands, setCommands] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [featureQuery, setFeatureQuery] = useState("");
  const [savedValues, setSavedValues] = useState({});
  const [draftValues, setDraftValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const busyOperation = useRef(0);

  function beginBusyOperation() {
    const operation = busyOperation.current + 1;
    busyOperation.current = operation;
    setBusy(true);
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

  function selectApplicationContext() {
    setStatus(null);
    setSelectedFeatureId(null);
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
  const selectedFeature = visibleFeatures.find(({ id }) => id === selectedFeatureId) || null;
  const selectedFeatureFilteredOut = Boolean(
    selectedFeature && featureQuery.trim() && !filteredFeatures.some(({ id }) => id === selectedFeature.id)
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
    if (typeof featureId === "string") setSelectedFeatureId(featureId);
  }), [api]);

  useEffect(() => {
    if (!loading && selectedFeatureId !== null && !visibleFeatures.some(({ id }) => id === selectedFeatureId)) {
      setSelectedFeatureId(null);
    }
  }, [loading, selectedFeatureId, visibleFeatures]);

  useEffect(() => {
    if (!selectedFeature) return undefined;
    let active = true;
    const operation = beginBusyOperation();
    setStatus(null);
    setSavedValues({});
    setDraftValues({});
    api.getConfig(selectedFeature.id)
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
  }, [api, selectedFeature?.id]);

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
    if (!selectedFeature || busy || !hasSchema) return;
    const operation = beginBusyOperation();
    setStatus(null);
    try {
      const values = await api.saveConfig(selectedFeature.id, draftValues);
      if (!isCurrentBusyOperation(operation)) return;
      setSavedValues(values);
      setDraftValues(values);
      const nextStatus = await api.refreshFeatureStatuses(selectedFeature.id);
      if (!isCurrentBusyOperation(operation)) return;
      setFeatureStatuses((current) => mergeStatuses(current, nextStatus));
      setStatus({ kind: "success", message: t("settings.saved") });
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "save") });
    } finally {
      finishBusyOperation(operation);
    }
  }

  async function reset() {
    if (!selectedFeature || busy || !hasSavedValues) return;
    const operation = beginBusyOperation();
    setStatus(null);
    try {
      const values = await api.resetConfig(selectedFeature.id);
      if (!isCurrentBusyOperation(operation)) return;
      setSavedValues(values);
      setDraftValues(values);
      const nextStatus = await api.refreshFeatureStatuses(selectedFeature.id);
      if (!isCurrentBusyOperation(operation)) return;
      setFeatureStatuses((current) => mergeStatuses(current, nextStatus));
      setStatus({ kind: "success", message: t("settings.reset") });
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

  async function changeLocale(event) {
    if (busy) return;
    const operation = beginBusyOperation();
    setStatus(null);
    try {
      await setLocalePreference(event.target.value);
    } catch (error) {
      if (isCurrentBusyOperation(operation)) setStatus({ kind: "error", message: presentSettingsOperationError(error, t, "locale") });
    } finally {
      finishBusyOperation(operation);
    }
  }

  if (loading) {
    return (
      <main className="settings-shell">
        <SettingsTitlebar api={api} Icon={Icon} t={t} />
        <div className="settings-state" role="status">{t("settings.loading")}</div>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <SettingsTitlebar api={api} Icon={Icon} t={t} />
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
                      title={warning?.message}
                      onClick={() => setSelectedFeatureId(feature.id)}
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
          <footer className="feature-navigation-footer">
            <button
              type="button"
              className={applicationSelected ? "feature-button selected" : "feature-button"}
              aria-current={applicationSelected ? "page" : undefined}
              onClick={selectApplicationContext}
            >
              <Icon name="settings" size={16} />
              <span>{t("settings.application")}</span>
            </button>
          </footer>
        </aside>

        <section className="settings-configuration" aria-labelledby={applicationSelected ? "application-title" : "feature-title"}>
          <div className="settings-configuration-scroll">
            {applicationSelected ? (
              <>
                <header className="settings-configuration-header">
                  <span className="settings-configuration-icon" aria-hidden="true"><Icon name="settings" size={16} /></span>
                  <h1 id="application-title">{t("settings.application")}</h1>
                </header>
                <section className="settings-section general-settings" aria-labelledby="language-heading">
                  <h2 id="language-heading">{t("settings.language")}</h2>
                  <div className="settings-fields">
                    <div className="settings-field">
                      <label htmlFor="locale-preference">{t("settings.language")}</label>
                      <select id="locale-preference" value={preference} disabled={busy} onChange={changeLocale}>
                        <option value="system">{t("settings.language.system")}</option>
                        <option value="en">{t("settings.language.en")}</option>
                        <option value="zh-CN">{t("settings.language.zh-CN")}</option>
                      </select>
                      <p className="settings-empty-copy">{t("settings.language.help")}</p>
                    </div>
                  </div>
                </section>
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
                <section className="settings-section" aria-labelledby="settings-heading">
                  <h2 id="settings-heading">{t("settings.configuration")}</h2>
                  <SettingsRenderer
                    schema={selectedFeature.configSchema}
                    values={draftValues}
                    onChange={updateDraft}
                    onPick={pickPath}
                    t={t}
                    disabled={busy}
                  />
                </section>
              </>
            )}
          </div>
          <footer className={applicationSelected ? "settings-actions application-settings-actions" : "settings-actions"}>
            <Feedback status={status} />
            {!applicationSelected && (
              <>
                <button type="button" className="secondary-button" disabled={busy || !hasSavedValues} onClick={reset}>
                  {t("settings.resetButton")}
                </button>
                <button type="button" className="primary-button" disabled={busy || !hasSchema} onClick={save}>
                  {busy ? t("settings.working") : t("settings.save")}
                </button>
              </>
            )}
          </footer>
        </section>

        <aside className="settings-inspector" aria-label={t("settings.contextInspector")}>
          {applicationSelected ? (
            <section className="settings-inspector-section" aria-labelledby="about-clackly-heading">
              <h2 id="about-clackly-heading">{t("settings.about")}</h2>
              <p className="inspector-description">{t("settings.applicationDescription")}</p>
              <dl className="inspector-metadata">
                <div><dt>{t("settings.version")}</dt><dd>{packageMetadata.version}</dd></div>
              </dl>
            </section>
          ) : selectedFeature && (
            <>
              <section className="settings-inspector-section" aria-labelledby="feature-about-heading">
                <h2 id="feature-about-heading">{t("settings.about")}</h2>
                <p className="inspector-description">{selectedFeature.description}</p>
                {(selectedFeature.version || selectedFeature.providers?.length > 0) && (
                  <dl className="inspector-metadata">
                    {selectedFeature.version && <div><dt>{t("settings.version")}</dt><dd>{selectedFeature.version}</dd></div>}
                    {selectedFeature.providers?.length > 0 && <div><dt>{t("settings.providers")}</dt><dd>{selectedFeature.providers.map(formatProviderName).filter(Boolean).join(", ")}</dd></div>}
                  </dl>
                )}
              </section>
              <section className="settings-inspector-section" aria-labelledby="feature-status-heading">
                <h2 id="feature-status-heading">{t("settings.status")}</h2>
                <p className={`feature-effective-status ${selectedEffectiveStatus.kind}`}>
                  {selectedEffectiveStatus.kind === "ready" && <span className="feature-ready-dot" aria-hidden="true" />}
                  {selectedEffectiveStatus.label}
                </p>
                {selectedEffectiveStatus.reason && <p className="feature-status-reason">{selectedEffectiveStatus.reason}</p>}
                <div className="inspector-actions">
                  <button type="button" className="secondary-button" disabled={busy} onClick={refreshStatus}>
                    <Icon name="refresh" size={14} />
                    <span>{t("settings.refresh")}</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setEnabled(!selectedFeatureStatus?.enabled)}
                  >
                    <Icon name="power" size={14} />
                    <span>{selectedFeatureStatus?.enabled ? t("settings.disable") : t("settings.enable")}</span>
                  </button>
                </div>
              </section>
              <section className="settings-inspector-section" aria-labelledby="feature-interaction-heading">
                <h2 id="feature-interaction-heading">{t("settings.interaction")}</h2>
                {helpCommands.length === 0 ? (
                  <p className="settings-empty-copy">{t("settings.noInteractionHelp")}</p>
                ) : helpCommands.map((command) => (
                  <div className="inspector-interaction-command" key={command.id}>
                    <h3>{command.name}</h3>
                    {command.help.map((entry, index) => (
                      <div className="inspector-interaction-row" key={`${entry.label}-${index}`} aria-label={t("interaction.rowAria", entry)}>
                        <InteractionInput label={entry.label} />
                        <span className="inspector-interaction-action-name">{entry.actionName}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

export default SettingsApp;
