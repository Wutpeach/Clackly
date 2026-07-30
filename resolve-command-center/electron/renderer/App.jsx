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
  Palette,
  Pin,
  Scissors,
  Search,
  Settings,
  SkipBack,
  Sparkles,
  Upload
} from "lucide-react";
import logoUrl from "./assets/clackly-logo.svg";
import markUrl from "./assets/clackly-mark.svg";
import {
  createPresentationCatalog,
  getCommandGroup,
  groupCommands,
  rankCommands
} from "./model.mjs";

const PREVIEW_COMMANDS = [
  {
    id: "timeline.addMarker",
    name: "Add Marker",
    keywords: ["marker", "mark", "timeline", "red"],
    capability: "marker.add"
  }
];

const browserPreview = !window.resolveCommandCenter;
const api = window.resolveCommandCenter || {
  listCommands: async () => PREVIEW_COMMANDS,
  executeCommand: async () => {
    throw new Error("Live preview only — open Clackly in Electron to execute commands.");
  },
  hidePalette: () => {},
  setPaletteMode: () => {},
  onPaletteShown: (callback) => {
    requestAnimationFrame(callback);
    return () => {};
  }
};

const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const INITIAL_PINNED = ["timeline.addMarker", "edit.bladeCut"];
const INITIAL_RECENT = ["color.changeClipColor", "timeline.goToIn"];

const ICONS = {
  marker: Bookmark,
  flag: Flag,
  blade: Scissors,
  palette: Palette,
  export: Upload,
  search: Search,
  "in-point": SkipBack,
  waveform: AudioWaveform,
  spark: Sparkles,
  command: CommandIcon,
  pin: Pin,
  settings: Settings,
  grip: Grip,
  arrow: ChevronLeft
};

function Icon({ name, size = 24 }) {
  const LucideIcon = ICONS[name] || CommandIcon;
  return <LucideIcon size={size} strokeWidth={1.9} absoluteStrokeWidth aria-hidden="true" focusable="false" />;
}

function getCommandAriaLabel(command) {
  return command.available ? undefined : `${command.name}, prototype only, cannot be executed`;
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
      <span className="command-icon"><Icon name={command.icon} size={22} /></span>
      <span className="command-copy">
        <span className="command-name">{command.name}</span>
        <span className="command-detail">
          {command.category}
          {!command.available && <span className="prototype-label">Prototype</span>}
        </span>
      </span>
      {pinned && <span className="pin-indicator" aria-label="Pinned" />}
      {command.shortcut && <kbd>{command.shortcut}</kbd>}
    </>
  );
}

function App() {
  const shellRef = useRef(null);
  const searchRef = useRef(null);
  const [mode, setMode] = useState("launcher");
  const [catalog, setCatalog] = useState(() => createPresentationCatalog([]));
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => new Set(INITIAL_PINNED));
  const [recentIds, setRecentIds] = useState(() => new Set(INITIAL_RECENT));

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

  useEffect(() => {
    let mounted = true;
    api.listCommands()
      .then((commands) => {
        if (mounted) setCatalog(createPresentationCatalog(commands));
      })
      .catch((error) => {
        if (mounted) setStatus(error.message);
      });

    const unsubscribe = api.onPaletteShown(() => {
      setMode("launcher");
      setQuery("");
      setSelectedIndex(0);
      setStatus("");
      setIsExecuting(false);
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
    requestAnimationFrame(() => {
      if (mode === "search") searchRef.current?.focus();
      else shellRef.current?.focus();
    });
  }, [mode]);

  useEffect(() => {
    setSelectedIndex(0);
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
    if (!command.available) {
      setStatus(`${command.name} is prototype-only and cannot be executed.`);
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
        onSettings={() => setStatus("Settings are outside this prototype.")}
      />

      {mode === "launcher" && (
        <section className="launcher-view" aria-label="Launcher">
          <div className="launcher-grid" role="listbox" aria-label="Pinned and recent commands">
            {launcherCommands.map((command, index) => (
              <button
                key={command.id}
                className={index === selectedIndex ? "command-tile selected" : "command-tile"}
                type="button"
                role="option"
                aria-label={getCommandAriaLabel(command)}
                aria-selected={index === selectedIndex}
                aria-disabled={!command.available}
                onMouseEnter={() => setSelectedIndex(index)}
                onFocus={() => setSelectedIndex(index)}
                onClick={() => executeCommand(command)}
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
          <div className="results-heading">
            <span>{query ? "Best matches" : "All commands"}</span>
            <span>{searchCommands.length}</span>
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
                aria-disabled={!command.available}
                onMouseEnter={() => setSelectedIndex(index)}
                onFocus={() => setSelectedIndex(index)}
                onClick={() => executeCommand(command)}
              >
                <CommandMeta command={command} pinned={pinnedIds.has(command.id)} />
              </button>
            ))}
            {searchCommands.length === 0 && (
              <div className="empty-state">
                <img src={markUrl} alt="" />
                <strong>No matching actions</strong>
                <span>Try a command, page, or editing verb.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {mode === "all-actions" && (

        <section className="all-actions-view" aria-label="All actions">
          <div className="all-actions-title">
            <div><span>Command catalog</span><h1>All Actions</h1></div>
            <span>{catalog.length} actions</span>
          </div>
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
                        aria-disabled={!command.available}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onFocus={() => setSelectedIndex(index)}
                        onClick={() => executeCommand(command)}
                      >
                        <CommandMeta command={command} pinned={pinnedIds.has(command.id)} />
                      </button>
                    );
                  })}
                </section>
              ))}
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
              <span>Type to search…</span><kbd>⌘ K</kbd>
            </button>
          </footer>
        </div>
      )}

      {(status || isExecuting) && (
        <div className={status ? "status-message error" : "status-message"} role="status" aria-live="polite">
          {status || "Running command…"}
        </div>
      )}
    </main>
  );
}

export default App;
