/**
 * THESIS: A compact Resolve precision instrument replaces the generic search window.
 * OWN-WORLD: Near-black tonal layers, hairlines, exact orange signals, and geometric SVG marks.
 * STORY: Launch a favorite, search any action, or browse the complete catalog without leaving the edit.
 * FIRST VIEWPORT: Wordmark and controls above a centered 3x3 command matrix and one slim action bar.
 * FORM: Dense launcher, the pinned operate-mode direction; no concept seed was needed for the settled brief.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  Bookmark,
  ChevronLeft,
  Command as CommandIcon,
  Flag,
  Grip,
  LoaderCircle,
  Palette,
  Pin,
  Scissors,
  Search,
  Send,
  Settings,
  SkipBack,
  Sparkles,
  TriangleAlert,
  Upload,
  X
} from "lucide-react";
import logoUrl from "./assets/clackly-logo.svg";
import SettingsApp from "./SettingsApp.jsx";
import {
  canExecuteCommand,
  createPresentationCatalog,
  getCommandHint,
  getCommandGroup,
  getFeatureWarning,
  getInteractionHelp,
  getRecoveryAction,
  groupCommands,
  rankCommands
} from "./model.mjs";

const browserPreview = !window.resolveCommandCenter;
const api = window.resolveCommandCenter || {
  listCommands: async () => [],
  listInteractionBindings: async () => [],
  executeCommand: async () => {
    throw new Error("Live preview only — open Clackly in Electron to execute commands.");
  },
  executeInteraction: async () => {
    throw new Error("Live preview only — open Clackly in Electron to execute commands.");
  },
  listFeatures: async () => [],
  listFeatureStatuses: async () => [],
  refreshFeatureStatuses: async () => [],
  setFeatureEnabled: async (featureId, enabled) => ({
    id: featureId,
    installed: true,
    enabled,
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  }),
  getConfig: async () => ({}),
  saveConfig: async (_capabilityId, values) => values,
  resetConfig: async () => ({}),
  pickPath: async () => null,
  openSettings: () => window.open("?view=settings", "clackly-settings"),
  closeSettings: () => window.close(),
  hidePalette: () => {},
  setPaletteMode: () => {},
  onPaletteShown: (callback) => {
    requestAnimationFrame(callback);
    return () => {};
  },
  onSettingsFeatureSelected: () => () => {}
};

const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

const ICONS = {
  marker: Bookmark,
  flag: Flag,
  blade: Scissors,
  palette: Palette,
  export: Upload,
  search: Search,
  send: Send,
  "in-point": SkipBack,
  waveform: AudioWaveform,
  spark: Sparkles,
  command: CommandIcon,
  pin: Pin,
  settings: Settings,
  grip: Grip,
  arrow: ChevronLeft,
  loading: LoaderCircle,
  warning: TriangleAlert,
  close: X
};

function Icon({ name, size = 24 }) {
  const LucideIcon = ICONS[name] || CommandIcon;
  return <LucideIcon size={size} strokeWidth={1.9} absoluteStrokeWidth aria-hidden="true" focusable="false" />;
}

function getCommandAriaLabel(command) {
  const warning = getFeatureWarning(command.featureStatus);
  return warning ? `${command.name}, ${warning.message}` : undefined;
}

function Header({ mode, selectedCommand, pinned, onBack, onTogglePin, onSettings }) {
  return (
    <header className="palette-header">
      <div className="header-surface">
        <div className="brand-lockup">
          {mode !== "launcher" && (
            <button className="icon-button back-button" type="button" onClick={onBack} aria-label="Back to launcher">
              <Icon name="arrow" size={18} />
            </button>
          )}
          <img className="clackly-logo" src={logoUrl} alt="Clackly" />
        </div>
        <div className="header-actions">
          <button
            className={pinned ? "icon-button active" : "icon-button"}
            type="button"
            onClick={onTogglePin}
            aria-label={selectedCommand ? `${pinned ? "Unpin" : "Pin"} ${selectedCommand.name}` : "Pin selected command"}
            aria-pressed={pinned}
            disabled={!selectedCommand}
          >
            <Icon name="pin" size={17} />
          </button>
          <button className="icon-button" type="button" onClick={onSettings} aria-label="Settings">
            <Icon name="settings" size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function CommandMeta({ command, pinned }) {
  return (
    <>
      <span className="command-icon">
        <Icon name={command.icon} size={22} />
        {pinned && <span className="pin-indicator" aria-label="Pinned" />}
      </span>
      <span className="command-copy">
        <span className="command-name">{command.name}</span>
        <span className="command-detail">
          {command.category}
          {!canExecuteCommand(command) && (
            <span className="status-label">{getFeatureWarning(command.featureStatus)?.kind}</span>
          )}
        </span>
      </span>
    </>
  );
}

function PaletteApp() {
  const shellRef = useRef(null);
  const searchRef = useRef(null);
  const [mode, setMode] = useState("launcher");
  const [catalog, setCatalog] = useState(() => createPresentationCatalog([]));
  const [commands, setCommands] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [hintedCommand, setHintedCommand] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  const [recentIds, setRecentIds] = useState(() => new Set());

  const launcherCommands = useMemo(
    () => rankCommands(catalog, "", pinnedIds, recentIds).slice(0, 9),
    [catalog, pinnedIds, recentIds]
  );
  const searchCommands = useMemo(
    () => rankCommands(catalog, query, pinnedIds, recentIds),
    [catalog, query, pinnedIds, recentIds]
  );
  const groupedCommands = useMemo(() => groupCommands(catalog), [catalog]);
  const allCommands = useMemo(
    () => groupedCommands.flatMap(([, commands]) => commands),
    [groupedCommands]
  );
  const activeCommands = mode === "search"
    ? searchCommands
    : mode === "all-actions"
      ? allCommands
      : launcherCommands;
  const selectedCommand = activeCommands[selectedIndex] || null;
  const currentLetter = selectedCommand ? getCommandGroup(selectedCommand) : groupedCommands[0]?.[0] || "A";
  const interactionHelp = canExecuteCommand(hintedCommand)
    ? getInteractionHelp(hintedCommand, commands, bindings)
    : [];
  const commandHint = interactionHelp.length ? "" : getCommandHint(hintedCommand);
  const activeHintId = (interactionHelp.length || commandHint) && !status && !isExecuting ? hintedCommand.id : null;
  const message = status || (isExecuting ? "Running command…" : commandHint);

  useEffect(() => {
    let mounted = true;
    const refreshCatalog = async () => {
      try {
        const [nextCommands, nextBindings, cachedStatuses] = await Promise.all([
          api.listCommands(),
          api.listInteractionBindings(),
          api.listFeatureStatuses()
        ]);
        if (mounted) {
          setCommands(nextCommands);
          setBindings(nextBindings);
          setCatalog(createPresentationCatalog(nextCommands, cachedStatuses));
        }
        const featureStatuses = await api.refreshFeatureStatuses();
        if (mounted) setCatalog(createPresentationCatalog(nextCommands, featureStatuses));
      } catch (error) {
        if (mounted) setStatus(error.message);
      }
    };
    refreshCatalog();

    const unsubscribe = api.onPaletteShown(() => {
      setMode("launcher");
      setQuery("");
      setSelectedIndex(0);
      setStatus("");
      setHintedCommand(null);
      setIsExecuting(false);
      refreshCatalog();
      requestAnimationFrame(() => shellRef.current?.focus());
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    api.setPaletteMode?.(mode);
    setSelectedIndex(0);
    setStatus("");
    setHintedCommand(null);
    requestAnimationFrame(() => {
      if (mode === "search") searchRef.current?.focus();
      else shellRef.current?.focus();
    });
  }, [mode]);

  useEffect(() => {
    setSelectedIndex(0);
    setHintedCommand(null);
  }, [query]);

  useEffect(() => {
    if (mode !== "all-actions") return;
    document.querySelector(`[data-command-index="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [mode, selectedIndex]);

  function enterSearch(text = "") {
    setQuery(text);
    setMode("search");
  }

  function goToLauncher() {
    setQuery("");
    setMode("launcher");
  }

  function toggleSelectedPin() {
    if (!selectedCommand) return;
    const commandId = selectedCommand.id;
    const next = new Set(pinnedIds);
    if (next.has(commandId)) next.delete(commandId);
    else next.add(commandId);
    setPinnedIds(next);

    if (mode !== "all-actions") {
      const reordered = rankCommands(catalog, mode === "search" ? query : "", next, recentIds);
      const nextIndex = reordered.findIndex((command) => command.id === commandId);
      setSelectedIndex(mode === "launcher" && nextIndex >= 9 ? 0 : Math.max(0, nextIndex));
    }
  }

  async function executeCommand(command) {
    if (!command || isExecuting) return;
    if (!command.available) return;
    if (!canExecuteCommand(command)) {
      setStatus(getFeatureWarning(command.featureStatus)?.message || "Feature is unavailable.");
      if (getRecoveryAction(command.featureStatus) === "open-settings") {
        api.openSettings(command.capability);
      }
      return;
    }

    setIsExecuting(true);
    setStatus("");
    try {
      await api.executeCommand(command.id);
      setRecentIds((current) => new Set([command.id, ...current]));
    } catch (error) {
      setStatus(error.message);
      setIsExecuting(false);
      requestAnimationFrame(() => (mode === "search" ? searchRef.current : shellRef.current)?.focus());
    }
  }

  async function executeInteraction(command, event) {
    if (event.type === "contextmenu") {
      event.preventDefault();
    }
    if (event.type === "click" && event.detail === 0) {
      executeCommand(command);
      return;
    }
    if (!command || isExecuting || !command.available) return;
    if (!canExecuteCommand(command)) {
      setStatus(getFeatureWarning(command.featureStatus)?.message || "Feature is unavailable.");
      if (getRecoveryAction(command.featureStatus) === "open-settings") {
        api.openSettings(command.capability);
      }
      return;
    }

    setIsExecuting(true);
    setStatus("");
    try {
      const result = await api.executeInteraction({
        target: command.id,
        type: "mouse",
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      });
      if (result.matched) {
        setRecentIds((current) => new Set([result.command, ...current]));
      } else {
        setIsExecuting(false);
      }
    } catch (error) {
      setStatus(error.message);
      setIsExecuting(false);
      requestAnimationFrame(() => (mode === "search" ? searchRef.current : shellRef.current)?.focus());
    }
  }

  function moveSelection(delta) {
    if (activeCommands.length === 0) return;
    setSelectedIndex((current) => Math.max(0, Math.min(current + delta, activeCommands.length - 1)));
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      api.hidePalette();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Enter") {
      const commandTrigger = event.target.closest?.(".command-tile, .command-row");
      if (event.target.closest?.("button") && !commandTrigger) return;
      event.preventDefault();
      executeCommand(selectedCommand);
      return;
    }
    if (mode !== "search" && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      enterSearch(event.key);
    }
  }

  function selectLetter(letter) {
    const index = allCommands.findIndex((command) => getCommandGroup(command) === letter);
    if (index >= 0) setSelectedIndex(index);
  }

  const selectedPinned = Boolean(selectedCommand && pinnedIds.has(selectedCommand.id));

  return (
    <main
      ref={shellRef}
      className={browserPreview ? "palette-shell browser-preview" : "palette-shell"}
      data-mode={mode}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <Header
        mode={mode}
        selectedCommand={selectedCommand}
        pinned={selectedPinned}
        onBack={goToLauncher}
        onTogglePin={toggleSelectedPin}
        onSettings={() => api.openSettings()}
      />

      {mode === "launcher" && (
        <section className="launcher-view" aria-label="Launcher">
          {launcherCommands.length > 0 ? (
          <div className="launcher-grid" role="listbox" aria-label="Commands">
            {launcherCommands.map((command, index) => (
              <button
                key={command.id}
                className={index === selectedIndex ? "command-tile selected" : "command-tile"}
                type="button"
                role="option"
                aria-label={getCommandAriaLabel(command)}
                aria-selected={index === selectedIndex}
                aria-disabled={!canExecuteCommand(command)}
                aria-describedby={activeHintId === command.id ? "command-hint" : undefined}
                onMouseEnter={() => {
                  setSelectedIndex(index);
                  setHintedCommand(command);
                }}
                onMouseLeave={() => setHintedCommand(null)}
                onFocus={() => {
                  setSelectedIndex(index);
                  setHintedCommand(command);
                }}
                onBlur={() => setHintedCommand(null)}
                onClick={(event) => executeInteraction(command, event)}
                onContextMenu={(event) => executeInteraction(command, event)}
              >
                <span className="tile-topline">
                  <kbd aria-hidden="true">{index + 1}</kbd>
                  {pinnedIds.has(command.id) ? <span className="pin-indicator" aria-label="Pinned" /> : <span />}
                </span>
                <span className="tile-icon"><Icon name={command.icon} size={30} /></span>
                <span className="tile-label">{command.name}</span>
              </button>
            ))}
          </div>
          ) : (
            <div className="empty-state">
              <strong>No actions registered</strong>
              <span>Registered command metadata will appear here automatically.</span>
            </div>
          )}
        </section>
      )}

      {mode === "search" && (
        <section className="search-view" aria-label="Search commands">
          <div className="search-control">
            <Icon name="search" size={18} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search commands"
              aria-label="Search commands"
              spellCheck="false"
              autoComplete="off"
            />
            <kbd>ESC</kbd>
          </div>
          <div className="command-list" role="listbox" aria-label="Search results">
            {searchCommands.map((command, index) => (
              <button
                key={command.id}
                className={index === selectedIndex ? "command-row selected" : "command-row"}
                type="button"
                role="option"
                aria-label={getCommandAriaLabel(command)}
                aria-selected={index === selectedIndex}
                aria-disabled={!canExecuteCommand(command)}
                aria-describedby={activeHintId === command.id ? "command-hint" : undefined}
                onMouseEnter={() => {
                  setSelectedIndex(index);
                  setHintedCommand(command);
                }}
                onMouseLeave={() => setHintedCommand(null)}
                onFocus={() => {
                  setSelectedIndex(index);
                  setHintedCommand(command);
                }}
                onBlur={() => setHintedCommand(null)}
                onClick={(event) => executeInteraction(command, event)}
                onContextMenu={(event) => executeInteraction(command, event)}
              >
                <CommandMeta command={command} pinned={pinnedIds.has(command.id)} />
              </button>
            ))}
            {searchCommands.length === 0 && (
              <div className="empty-state">
                <strong>No matching actions</strong>
                <span>Try another command name or editing verb.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {mode === "all-actions" && (
        <section className="all-actions-view" aria-label="All actions">
          <div className="all-actions-body">
            <div className="grouped-command-list" role="listbox" aria-label="All commands">
              {groupedCommands.map(([letter, commands]) => (
                <section key={letter} className="command-group" role="group" aria-labelledby={`group-${letter}`}>
                  <h2 id={`group-${letter}`} className={letter === currentLetter ? "active" : ""}>{letter}</h2>
                  {commands.map((command) => {
                    const index = allCommands.indexOf(command);
                    return (
                      <button
                        key={command.id}
                        data-command-index={index}
                        className={index === selectedIndex ? "command-row selected" : "command-row"}
                        type="button"
                        role="option"
                        aria-label={getCommandAriaLabel(command)}
                        aria-selected={index === selectedIndex}
                        aria-disabled={!canExecuteCommand(command)}
                        aria-describedby={activeHintId === command.id ? "command-hint" : undefined}
                        onMouseEnter={() => {
                          setSelectedIndex(index);
                          setHintedCommand(command);
                        }}
                        onMouseLeave={() => setHintedCommand(null)}
                        onFocus={() => {
                          setSelectedIndex(index);
                          setHintedCommand(command);
                        }}
                        onBlur={() => setHintedCommand(null)}
                        onClick={(event) => executeInteraction(command, event)}
                        onContextMenu={(event) => executeInteraction(command, event)}
                      >
                        <CommandMeta command={command} pinned={pinnedIds.has(command.id)} />
                      </button>
                    );
                  })}
                </section>
              ))}
              {groupedCommands.length === 0 && (
                <div className="empty-state">
                  <strong>No actions registered</strong>
                  <span>Registered command metadata will appear here automatically.</span>
                </div>
              )}
            </div>
            <nav className="alphabet-rail" aria-label="Command groups">
              {ALPHABET.map((letter) => {
                const available = groupedCommands.some(([groupLetter]) => groupLetter === letter);
                return (
                  <button
                    key={letter}
                    className={letter === currentLetter ? "active" : ""}
                    type="button"
                    disabled={!available}
                    aria-label={`Go to ${letter} commands`}
                    aria-current={letter === currentLetter ? "true" : undefined}
                    onClick={() => selectLetter(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </nav>
          </div>
        </section>

      )}

      {mode === "launcher" && (
        <div className="launcher-footer-area">
          <footer className="launcher-footer">
            <button
              type="button"
              className="all-actions-button"
              aria-label="All Actions"
              title="All Actions"
              onClick={() => setMode("all-actions")}
            >
              <Icon name="grip" size={18} />
            </button>
            <button type="button" className="search-prompt" onClick={() => enterSearch("")}>
              <span>Type to search…</span>
            </button>
          </footer>
        </div>
      )}

      {(message || interactionHelp.length > 0) && (
        <div
          id={activeHintId ? "command-hint" : undefined}
          className={`${status ? "status-message error" : "status-message"}${activeHintId && interactionHelp.length ? " interaction-help" : ""}`}
          role={activeHintId ? "tooltip" : "status"}
          aria-live={activeHintId ? undefined : "polite"}
        >
          {activeHintId && interactionHelp.length ? interactionHelp.map((entry, index) => (
            <div className="interaction-help-row" key={`${entry.label}-${index}`}>
              <span className="interaction-help-label">{entry.label}</span>
              <span className="interaction-help-description">{entry.description}</span>
            </div>
          )) : message}
        </div>
      )}
    </main>
  );
}

function App() {
  return new URLSearchParams(window.location.search).get("view") === "settings"
    ? <SettingsApp api={api} Icon={Icon} />
    : <PaletteApp />;
}

export default App;
