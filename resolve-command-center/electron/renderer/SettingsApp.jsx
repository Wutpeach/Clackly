import React, { useEffect, useMemo, useState } from "react";
import logoUrl from "./assets/clackly-logo.svg";
import SettingsRenderer from "./SettingsRenderer.jsx";
import { useLocalization } from "./LocalizationContext.jsx";
import { localizeCommands, localizeFeatureMetadata, presentError } from "../../localization/presentation.mjs";
import {
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
        <span className="settings-titlebar-brand"><img src={logoUrl} alt="Clackly" /></span>
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

function InteractionHelpInput({ label }) {
  const tokens = label.split(" + ").filter(Boolean);
  return (
    <span className="feature-help-input" aria-label={label}>
      {tokens.map((token, index) => (
        <React.Fragment key={`${token}-${index}`}>
          {index > 0 && <span className="feature-help-plus" aria-hidden="true">+</span>}
          <kbd aria-hidden="true">{token}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

function SettingsApp({ api, Icon }) {
  const { effectiveLocale, preference, setLocalePreference, t } = useLocalization();
  const [features, setFeatures] = useState([]);
  const [featureStatuses, setFeatureStatuses] = useState([]);
  const [commands, setCommands] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [savedValues, setSavedValues] = useState({});
  const [draftValues, setDraftValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const localizedFeatures = useMemo(
    () => features.map((feature) => localizeFeatureMetadata(feature, effectiveLocale)),
    [features, effectiveLocale]
  );
  const localizedCommands = useMemo(() => localizeCommands(commands, effectiveLocale), [commands, effectiveLocale]);
  const visibleFeatures = useMemo(() => joinFeatureStatuses(localizedFeatures, featureStatuses)
    .filter(({ featureStatus }) => isFeatureVisible(featureStatus)), [localizedFeatures, featureStatuses]);
  const selectedFeature = visibleFeatures.find(({ id }) => id === selectedId) || null;
  const selectedFeatureStatus = selectedFeature?.featureStatus || null;
  const selectedWarning = getFeatureWarning(selectedFeatureStatus, t);
  const groupedFeatures = useMemo(() => groupFeaturesByCategory(visibleFeatures), [visibleFeatures]);
  const helpCommands = useMemo(() => getInteractionHelpCommands(localizedCommands, selectedId, bindings, t), [
    bindings,
    localizedCommands,
    selectedId,
    t
  ]);
  const hasSchema = Boolean(selectedFeature && Object.keys(selectedFeature.configSchema).length);
  const hasSavedValues = Object.keys(savedValues).length > 0;

  useEffect(() => {
    let active = true;
    Promise.all([
      api.listFeatures(),
      api.listCommands(),
      api.listInteractionBindings(),
      api.listFeatureStatuses()
    ])
      .then(([nextFeatures, nextCommands, nextBindings, nextStatuses]) => {
        if (!active) return;
        setFeatures(nextFeatures);
        setCommands(nextCommands);
        setBindings(nextBindings);
        setFeatureStatuses(nextStatuses);
        setSelectedId((current) => current === "general" || nextFeatures.some(({ id }) => id === current)
          ? current
          : "general");
        return api.refreshFeatureStatuses();
      })
      .then((nextStatuses) => {
        if (active && nextStatuses) setFeatureStatuses(nextStatuses);
      })
      .catch((error) => {
        if (active) setStatus({ kind: "error", message: presentError(error, t) });
      })
      .finally(() => {
        if (active) {
          setSelectedId((current) => current || "general");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    document.title = t("settings.title");
  }, [t]);

  useEffect(() => api.onSettingsFeatureSelected((featureId) => {
    if (typeof featureId === "string") setSelectedId(featureId);
  }), [api]);

  useEffect(() => {
    if (selectedId !== "general" && visibleFeatures.length > 0 && !visibleFeatures.some(({ id }) => id === selectedId)) {
      setSelectedId("general");
    }
  }, [selectedId, visibleFeatures]);

  useEffect(() => {
    if (!selectedId || selectedId === "general") return;
    let active = true;
    setBusy(true);
    setStatus(null);
    setSavedValues({});
    setDraftValues({});
    api.getConfig(selectedId)
      .then((values) => {
        if (!active) return;
        setSavedValues(values);
        setDraftValues(values);
      })
      .catch((error) => {
        if (active) setStatus({ kind: "error", message: presentError(error, t) });
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [api, selectedId]);

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
      setStatus({ kind: "error", message: presentError(error, t) });
      return null;
    }
  }

  async function save() {
    if (!selectedFeature || busy || !hasSchema) return;
    setBusy(true);
    setStatus(null);
    try {
      const values = await api.saveConfig(selectedFeature.id, draftValues);
      setSavedValues(values);
      setDraftValues(values);
      const nextStatus = await api.refreshFeatureStatuses(selectedFeature.id);
      setFeatureStatuses((current) => mergeStatuses(current, nextStatus));
      setStatus({ kind: "success", message: t("settings.saved") });
    } catch (error) {
      setStatus({ kind: "error", message: presentError(error, t) });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!selectedFeature || busy || !hasSavedValues) return;
    setBusy(true);
    setStatus(null);
    try {
      const values = await api.resetConfig(selectedFeature.id);
      setSavedValues(values);
      setDraftValues(values);
      const nextStatus = await api.refreshFeatureStatuses(selectedFeature.id);
      setFeatureStatuses((current) => mergeStatuses(current, nextStatus));
      setStatus({ kind: "success", message: t("settings.reset") });
    } catch (error) {
      setStatus({ kind: "error", message: presentError(error, t) });
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(enabled) {
    if (!selectedFeature || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const next = await api.setFeatureEnabled(selectedFeature.id, enabled);
      setFeatureStatuses((current) => mergeStatuses(current, next));
      setStatus({ kind: "success", message: t(enabled ? "settings.enabled" : "settings.disabled") });
    } catch (error) {
      setStatus({ kind: "error", message: presentError(error, t) });
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!selectedFeature || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const next = await api.refreshFeatureStatuses(selectedFeature.id);
      setFeatureStatuses((current) => mergeStatuses(current, next));
      setStatus({ kind: "success", message: t("settings.refreshed") });
    } catch (error) {
      setStatus({ kind: "error", message: presentError(error, t) });
    } finally {
      setBusy(false);
    }
  }

  async function changeLocale(event) {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await setLocalePreference(event.target.value);
    } catch (error) {
      setStatus({ kind: "error", message: presentError(error, t) });
    } finally {
      setBusy(false);
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

  const noVisibleFeaturesMessage = visibleFeatures.length === 0
    ? (status?.kind === "error" ? status.message : t("settings.none.detail"))
    : null;

  return (
    <main className="settings-shell">
      <SettingsTitlebar api={api} Icon={Icon} t={t} />
      <div className="settings-workspace">
        <aside className="feature-sidebar" aria-label={t("settings.features")}>
          <nav className="feature-navigation">
          <section className="feature-category" aria-labelledby="general-category">
            <h2 id="general-category">{t("settings.general")}</h2>
            <button
              type="button"
              className={selectedId === "general" ? "feature-button selected" : "feature-button"}
              aria-current={selectedId === "general" ? "page" : undefined}
              disabled={busy}
              onClick={() => setSelectedId("general")}
            >
              <Icon name="settings" size={16} />
              <span>{t("settings.general")}</span>
            </button>
          </section>
          {groupedFeatures.map(([category, categoryFeatures], categoryIndex) => (
            <section className="feature-category" key={category} aria-labelledby={`feature-category-${categoryIndex}`}>
              <h2 id={`feature-category-${categoryIndex}`}>{category}</h2>
              {categoryFeatures.map((feature) => {
                const warning = getFeatureWarning(feature.featureStatus, t);
                const descriptionId = `feature-status-${feature.id.replace(/[^a-z0-9_-]/gi, "-")}`;
                return (
                <button
                  key={feature.id}
                  type="button"
                  className={feature.id === selectedId ? "feature-button selected" : "feature-button"}
                  aria-current={feature.id === selectedId ? "page" : undefined}
                  aria-describedby={warning ? descriptionId : undefined}
                  title={warning?.message}
                  disabled={busy}
                  onClick={() => setSelectedId(feature.id)}
                >
                  <Icon name={feature.icon} size={16} />
                  <span>{feature.name}</span>
                  {warning && (
                    <span
                      className={warning.kind === "loading"
                        ? "feature-status-indicator loading"
                        : "feature-status-indicator"}
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
          </nav>
        </aside>

        {selectedId === "general" && (
          <section className="feature-detail" aria-labelledby="general-title">
            <div className="feature-detail-scroll">
              <header className="feature-detail-header">
                <span className="feature-detail-icon" aria-hidden="true"><Icon name="settings" size={16} /></span>
                <div><h1 id="general-title">{t("settings.general")}</h1></div>
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
              {noVisibleFeaturesMessage && (
                <div className="settings-state" role={status?.kind === "error" ? "alert" : undefined}>
                  <strong>{status?.kind === "error" ? t("settings.unavailable") : t("settings.none")}</strong>
                  <span>{noVisibleFeaturesMessage}</span>
                </div>
              )}
            </div>
            <footer className="settings-actions">
              <div className={status?.kind === "error" ? "settings-feedback error" : "settings-feedback"} role={status?.kind === "error" ? "alert" : "status"} aria-live="polite">
                {status?.message}
              </div>
            </footer>
          </section>
        )}

        {selectedFeature && (
          <section className="feature-detail" aria-labelledby="feature-title">
          <div className="feature-detail-scroll">
            <header className="feature-detail-header">
              <span className="feature-detail-icon" aria-hidden="true"><Icon name={selectedFeature.icon} size={16} /></span>
              <div>
                <span className="feature-category-label">{selectedFeature.category}</span>
                <h1 id="feature-title">{selectedFeature.name}</h1>
              </div>
            </header>

            <p className="feature-description">{selectedFeature.description}</p>

            <section className="settings-section feature-lifecycle" aria-labelledby="lifecycle-heading">
              <div className="feature-lifecycle-heading">
                <div>
                  <h2 id="lifecycle-heading">{t("settings.featureStatus")}</h2>
                  <p>{selectedWarning?.message || t("settings.ready")}</p>
                </div>
                <div className="feature-lifecycle-actions">
                  <button type="button" className="secondary-button" disabled={busy} onClick={refreshStatus}>
                    {t("settings.refresh")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setEnabled(!selectedFeatureStatus.enabled)}
                  >
                    {selectedFeatureStatus.enabled ? t("settings.disable") : t("settings.enable")}
                  </button>
                </div>
              </div>
              <dl className="feature-lifecycle-details">
                <div><dt>{t("settings.installed")}</dt><dd>{selectedFeatureStatus.installed ? t("settings.yes") : t("settings.no")}</dd></div>
                <div><dt>{t("settings.enabledLabel")}</dt><dd>{selectedFeatureStatus.enabled ? t("settings.yes") : t("settings.no")}</dd></div>
                <div><dt>{t("settings.readiness")}</dt><dd>{t(`status.label.${selectedFeatureStatus.status}`)}</dd></div>
                {selectedFeatureStatus.details.missing.length > 0 && (
                  <div><dt>{t("settings.missing")}</dt><dd>{selectedFeatureStatus.details.missing.join(", ")}</dd></div>
                )}
              </dl>
            </section>

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

            <section className="settings-section" aria-labelledby="help-heading">
              <h2 id="help-heading">{t("settings.interactionHelp")}</h2>
              {helpCommands.length === 0 ? (
                <p className="settings-empty-copy">{t("settings.noInteractionHelp")}</p>
              ) : helpCommands.map((command) => (
                <div className="feature-help-command" key={command.id}>
                  <h3>{command.name}</h3>
                  {command.help.map((entry, index) => (
                    <div className="feature-help-row" key={`${entry.label}-${index}`}>
                      <InteractionHelpInput label={entry.label} />
                      <p>{entry.description}</p>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </div>

          <footer className="settings-actions">
            <div
              className={status?.kind === "error" ? "settings-feedback error" : "settings-feedback"}
              role={status?.kind === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {status?.message}
            </div>
            <button type="button" className="secondary-button" disabled={busy || !hasSavedValues} onClick={reset}>
              {t("settings.resetButton")}
            </button>
            <button type="button" className="primary-button" disabled={busy || !hasSchema} onClick={save}>
              {busy ? t("settings.working") : t("settings.save")}
            </button>
          </footer>
          </section>
        )}
      </div>
    </main>
  );
}

export default SettingsApp;
