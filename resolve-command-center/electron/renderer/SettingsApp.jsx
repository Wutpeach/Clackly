import React, { useEffect, useMemo, useState } from "react";
import logoUrl from "./assets/clackly-logo.svg";
import SettingsRenderer from "./SettingsRenderer.jsx";
import {
  getFeatureWarning,
  getInteractionHelp,
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

function SettingsApp({ api, Icon }) {
  const [features, setFeatures] = useState([]);
  const [featureStatuses, setFeatureStatuses] = useState([]);
  const [commands, setCommands] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [savedValues, setSavedValues] = useState({});
  const [draftValues, setDraftValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const visibleFeatures = useMemo(() => joinFeatureStatuses(features, featureStatuses)
    .filter(({ featureStatus }) => isFeatureVisible(featureStatus)), [features, featureStatuses]);
  const selectedFeature = visibleFeatures.find(({ id }) => id === selectedId) || null;
  const selectedFeatureStatus = selectedFeature?.featureStatus || null;
  const selectedWarning = getFeatureWarning(selectedFeatureStatus);
  const groupedFeatures = useMemo(() => groupFeaturesByCategory(visibleFeatures), [visibleFeatures]);
  const helpCommands = useMemo(() => commands
    .filter((command) => command.capability === selectedId)
    .map((command) => ({ ...command, help: getInteractionHelp(command) }))
    .filter((command) => command.help.length > 0), [commands, selectedId]);
  const hasSchema = Boolean(selectedFeature && Object.keys(selectedFeature.configSchema).length);
  const hasSavedValues = Object.keys(savedValues).length > 0;

  useEffect(() => {
    document.title = "Clackly Settings";
    let active = true;
    Promise.all([api.listFeatures(), api.listCommands(), api.listFeatureStatuses()])
      .then(([nextFeatures, nextCommands, nextStatuses]) => {
        if (!active) return;
        setFeatures(nextFeatures);
        setCommands(nextCommands);
        setFeatureStatuses(nextStatuses);
        setSelectedId((current) => nextFeatures.some(({ id }) => id === current)
          ? current
          : nextFeatures[0]?.id || "");
        return api.refreshFeatureStatuses();
      })
      .then((nextStatuses) => {
        if (active && nextStatuses) setFeatureStatuses(nextStatuses);
      })
      .catch((error) => {
        if (active) setStatus({ kind: "error", message: error.message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api]);

  useEffect(() => api.onSettingsFeatureSelected((featureId) => {
    if (typeof featureId === "string") setSelectedId(featureId);
  }), [api]);

  useEffect(() => {
    if (visibleFeatures.length > 0 && !visibleFeatures.some(({ id }) => id === selectedId)) {
      setSelectedId(visibleFeatures[0].id);
    }
  }, [selectedId, visibleFeatures]);

  useEffect(() => {
    if (!selectedId) return;
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
        if (active) setStatus({ kind: "error", message: error.message });
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
      if (picked === null) setStatus({ kind: "neutral", message: "Selection cancelled." });
      return picked;
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
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
      setStatus({ kind: "success", message: "Settings saved." });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
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
      setStatus({ kind: "success", message: "Settings reset." });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
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
      setStatus({ kind: "success", message: enabled ? "Feature enabled." : "Feature disabled." });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
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
      setStatus({ kind: "success", message: "Feature status refreshed." });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="settings-shell settings-state" role="status">Loading features…</main>;
  }

  if (visibleFeatures.length === 0) {
    const loadError = status?.kind === "error" ? status.message : null;
    return (
      <main className="settings-shell settings-state" role={loadError ? "alert" : undefined}>
        <strong>{loadError ? "Unable to load features" : "No features registered"}</strong>
        <span>{loadError || "Registered capability metadata will appear here automatically."}</span>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <aside className="feature-sidebar" aria-label="Features">
        <div className="settings-brand"><img src={logoUrl} alt="Clackly" /></div>
        <nav className="feature-navigation">
          {groupedFeatures.map(([category, categoryFeatures], categoryIndex) => (
            <section className="feature-category" key={category} aria-labelledby={`feature-category-${categoryIndex}`}>
              <h2 id={`feature-category-${categoryIndex}`}>{category}</h2>
              {categoryFeatures.map((feature) => {
                const warning = getFeatureWarning(feature.featureStatus);
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
                  <Icon name={feature.icon} size={17} />
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

      {selectedFeature && (
        <section className="feature-detail" aria-labelledby="feature-title">
          <div className="feature-detail-scroll">
            <header className="feature-detail-header">
              <span className="feature-detail-icon"><Icon name={selectedFeature.icon} size={26} /></span>
              <div>
                <span className="feature-category-label">{selectedFeature.category}</span>
                <h1 id="feature-title">{selectedFeature.name}</h1>
              </div>
            </header>

            <p className="feature-description">{selectedFeature.description}</p>

            <section className="settings-section feature-lifecycle" aria-labelledby="lifecycle-heading">
              <div className="feature-lifecycle-heading">
                <div>
                  <h2 id="lifecycle-heading">Feature Status</h2>
                  <p>{selectedWarning?.message || "Ready to use."}</p>
                </div>
                <div className="feature-lifecycle-actions">
                  <button type="button" className="secondary-button" disabled={busy} onClick={refreshStatus}>
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setEnabled(!selectedFeatureStatus.enabled)}
                  >
                    {selectedFeatureStatus.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
              <dl className="feature-lifecycle-details">
                <div><dt>Installed</dt><dd>{selectedFeatureStatus.installed ? "Yes" : "No"}</dd></div>
                <div><dt>Enabled</dt><dd>{selectedFeatureStatus.enabled ? "Yes" : "No"}</dd></div>
                <div><dt>Readiness</dt><dd>{selectedFeatureStatus.status.replaceAll("-", " ")}</dd></div>
                {selectedFeatureStatus.details.missing.length > 0 && (
                  <div><dt>Missing</dt><dd>{selectedFeatureStatus.details.missing.join(", ")}</dd></div>
                )}
              </dl>
            </section>

            <section className="settings-section" aria-labelledby="settings-heading">
              <h2 id="settings-heading">Settings</h2>
              <SettingsRenderer
                schema={selectedFeature.configSchema}
                values={draftValues}
                onChange={updateDraft}
                onPick={pickPath}
                disabled={busy}
              />
            </section>

            <section className="settings-section" aria-labelledby="help-heading">
              <h2 id="help-heading">Interaction Help</h2>
              {helpCommands.length === 0 ? (
                <p className="settings-empty-copy">No interaction help available.</p>
              ) : helpCommands.map((command) => (
                <div className="feature-help-command" key={command.id}>
                  <h3>{command.name}</h3>
                  {command.help.map((entry, index) => (
                    <div className="feature-help-row" key={`${entry.label}-${index}`}>
                      <span>{entry.label}</span>
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
              Reset
            </button>
            <button type="button" className="primary-button" disabled={busy || !hasSchema} onClick={save}>
              {busy ? "Working…" : "Save"}
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}

export default SettingsApp;
