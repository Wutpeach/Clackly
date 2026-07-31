import React, { useEffect, useMemo, useState } from "react";
import logoUrl from "./assets/clackly-logo.svg";
import SettingsRenderer from "./SettingsRenderer.jsx";
import { getInteractionHelp, groupFeaturesByCategory } from "./model.mjs";

function SettingsApp({ api, Icon }) {
  const [features, setFeatures] = useState([]);
  const [commands, setCommands] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [savedValues, setSavedValues] = useState({});
  const [draftValues, setDraftValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const selectedFeature = features.find(({ id }) => id === selectedId) || null;
  const groupedFeatures = useMemo(() => groupFeaturesByCategory(features), [features]);
  const helpCommands = useMemo(() => commands
    .filter((command) => command.capability === selectedId)
    .map((command) => ({ ...command, help: getInteractionHelp(command) }))
    .filter((command) => command.help.length > 0), [commands, selectedId]);
  const hasSchema = Boolean(selectedFeature && Object.keys(selectedFeature.configSchema).length);
  const hasSavedValues = Object.keys(savedValues).length > 0;

  useEffect(() => {
    document.title = "Clackly Settings";
    let active = true;
    Promise.all([api.listFeatures(), api.listCommands()])
      .then(([nextFeatures, nextCommands]) => {
        if (!active) return;
        setFeatures(nextFeatures);
        setCommands(nextCommands);
        setSelectedId(nextFeatures[0]?.id || "");
      })
      .catch((error) => {
        if (active) setStatus({ kind: "error", message: error.message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [api]);

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
      setStatus({ kind: "success", message: "Settings reset." });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="settings-shell settings-state" role="status">Loading features…</main>;
  }

  if (features.length === 0) {
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
              {categoryFeatures.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className={feature.id === selectedId ? "feature-button selected" : "feature-button"}
                  aria-current={feature.id === selectedId ? "page" : undefined}
                  disabled={busy}
                  onClick={() => setSelectedId(feature.id)}
                >
                  <Icon name={feature.icon} size={17} />
                  <span>{feature.name}</span>
                </button>
              ))}
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
