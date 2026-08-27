/**
 * THESIS: A compact Resolve command menu puts search and the current action list ahead of product chrome.
 * OWN-WORLD: Near-black tonal layers, fine neutral hairlines, light selected anchors, and monochrome Lucide marks.
 * STORY: Launch a favorite, search a command, or preview selected-command Actions without leaving the edit.
 * FIRST VIEWPORT: Search leads a truthful Pinned, Recent, and Commands list; secondary actions recede into one footer.
 * FORM: Dense Blender-style floating menu with local pointer hover and existing keyboard selection authority.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  Bookmark,
  ChevronLeft,
  Command as CommandIcon,
  Flag,
  Image,
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
import SettingsApp from "./SettingsApp.jsx";
import {
  canExecuteCommand,
  createPresentationCatalog,
  getCommandHint,
  getFeatureWarning,
  getInteractionHelp,
  getRecoveryAction,
  projectLauncherSections,
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
  openAttachedActions: async () => null,
  closeAttachedActions: () => {},
  onPaletteShown: (callback) => {
    requestAnimationFrame(callback);
    return () => {};
  },
  onSettingsFeatureSelected: () => () => {}
};

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
  arrow: ChevronLeft,
  loading: LoaderCircle,
  warning: TriangleAlert,
  image: Image,
  close: X
};

function Icon({ name, size = 24 }) {
  const LucideIcon = ICONS[name] || CommandIcon;
  return <LucideIcon size={size} strokeWidth={1.9} absoluteStrokeWidth aria-hidden="true" focusable="false" />;
}

function getCommandAriaLabel(command) {
  const warning = getFeatureWarning(command.featureStatus);
  return warning ? `${command.name}, ${warning.message}` : command.name;
}

function getCommandAccessibleDescription(command, commands, bindings) {
  const interactionHelp = canExecuteCommand(command) ? getInteractionHelp(command, commands, bindings) : [];
  const interactionText = interactionHelp.map(({ label, description }) => `${label}: ${description}`).join(". ");
  return interactionText || getCommandHint(command) || command.description;
}

function useOverflowTooltip(labelRef) {
  const timeoutRef = useRef(null);
  const [placement, setPlacement] = useState(null);

  const hide = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPlacement(null);
  };

  const reveal = (immediate) => {
    const update = () => {
      const label = labelRef.current;
      const shell = document.querySelector(".palette-shell");
      if (!label || !shell || label.scrollWidth <= label.clientWidth + 1) return;
      const labelRect = label.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const width = Math.min(210, Math.max(180, shellRect.width - 12));
      const left = Math.min(Math.max(labelRect.left, shellRect.left + 6), shellRect.right - width - 6);
      const top = Math.min(Math.max(labelRect.bottom + 5, shellRect.top + 6), shellRect.bottom - 54);
      setPlacement({ left, top, width });
    };
    hide();
    if (immediate) update();
    else timeoutRef.current = window.setTimeout(update, 450);
  };

  useEffect(() => hide, []);
  return { placement, reveal, hide };
}

function OverflowTooltip({ placement, text }) {
  if (!placement) return null;
  return (
    <span className="palette-tooltip" role="tooltip" style={placement}>
      {text}
    </span>
  );
}

function CommandMeta({ command, pinned, labelRef }) {
  return (
    <>
      <span className="command-icon">
        <Icon name={command.icon} size={22} />
        {pinned && <span className="pin-indicator" aria-label="Pinned" />}
      </span>
      <span ref={labelRef} className="command-name" title={command.name}>{command.name}</span>
      <span className="command-detail">
        <span className="command-category">{command.category}</span>
        {!canExecuteCommand(command) && (
          <span className="status-label">{getFeatureWarning(command.featureStatus)?.kind}</span>
        )}
      </span>
    </>
  );
}

function CommandRow({
  command,
  index,
  pinned,
  selected,
  hovered,
  accessibleDescription,
  keycap,
  onHover,
  onLeave,
  onFocus,
  onBlur,
  onClick,
  onContextMenu
}) {
  const labelRef = useRef(null);
  const { placement, reveal, hide } = useOverflowTooltip(labelRef);
  const className = ["command-row", selected && "selected", hovered && "hovered"].filter(Boolean).join(" ");
  const descriptionId = `command-description-${index}`;

  return (
    <button
      data-command-index={index}
      className={className}
      type="button"
      role="option"
      aria-label={getCommandAriaLabel(command)}
      aria-selected={selected}
      aria-disabled={!canExecuteCommand(command)}
      aria-describedby={accessibleDescription ? descriptionId : undefined}
      onMouseEnter={() => {
        onHover(command);
        reveal(false);
      }}
      onMouseLeave={() => {
        hide();
        onLeave();
      }}
      onFocus={() => {
        onFocus(command, index);
        reveal(true);
      }}
      onBlur={() => {
        hide();
        onBlur();
      }}
      onClick={(event) => onClick(command, event)}
      onContextMenu={(event) => onContextMenu(command, event)}
    >
      <CommandMeta command={command} pinned={pinned} labelRef={labelRef} />
      {keycap && <kbd aria-hidden="true">{keycap}</kbd>}
      {accessibleDescription && <span id={descriptionId} className="screen-reader-only">{accessibleDescription}</span>}
      <OverflowTooltip placement={placement} text={command.name} />
    </button>
  );
}

/**
 * Browser-process-only presentation boundary for developer/test Actions evidence.
 * Production has no Action authority yet, so this intentionally resolves to an
 * empty shell unless a harness injects the explicitly named developer value
 * before the renderer loads. These display rows are neither Actions domain data
 * nor persisted/IPC/runtime payloads.
 */
function getDeveloperTestActionPresentation(commandId) {
  const source = window.__CLACKLY_DEVELOPER_TEST_ACTIONS_PRESENTATION__;
  if (!source || source.commandId !== commandId || !Array.isArray(source.rows)) return [];

  return source.rows
    .filter((row) => row && typeof row.label === "string" && row.label.trim())
    .map((row) => ({
      label: row.label.trim(),
      description: typeof row.description === "string" ? row.description.trim() : ""
    }));
}

function ActionRow({ action, index, selected, hovered, onHover, onLeave, onFocus, onClick }) {
  const labelRef = useRef(null);
  const { placement, reveal, hide } = useOverflowTooltip(labelRef);
  const className = ["action-row", selected && "selected", hovered && "hovered"].filter(Boolean).join(" ");

  return (
    <button
      data-action-index={index}
      className={className}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={action.description ? `${action.label}, ${action.description}` : action.label}
      title={action.description || action.label}
      onMouseEnter={() => {
        onHover(index);
        reveal(false);
      }}
      onMouseLeave={() => {
        hide();
        onLeave();
      }}
      onFocus={() => {
        onFocus(index);
        reveal(true);
      }}
      onBlur={hide}
      onClick={() => onClick(action)}
    >
      <span ref={labelRef} className="action-label" title={action.label}>{action.label}</span>
      {action.description && <span className="action-description">{action.description}</span>}
      <OverflowTooltip placement={placement} text={action.label} />
    </button>
  );
}

function PaletteApp() {
  const shellRef = useRef(null);
  const mainSurfaceRef = useRef(null);
  const searchRef = useRef(null);
  const actionsSearchRef = useRef(null);
  const actionsPanelRef = useRef(null);
  const [mode, setMode] = useState("launcher");
  const [catalog, setCatalog] = useState(() => createPresentationCatalog([]));
  const [commands, setCommands] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [hoveredCommandId, setHoveredCommandId] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  const [recentIds, setRecentIds] = useState(() => new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsContextCommand, setActionsContextCommand] = useState(null);
  const [actionQuery, setActionQuery] = useState("");
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [hoveredActionIndex, setHoveredActionIndex] = useState(null);
  const [actionAcknowledgement, setActionAcknowledgement] = useState("");
  const [attachedPanelGeometry, setAttachedPanelGeometry] = useState(null);

  const launcherCommands = useMemo(
    () => rankCommands(catalog, "", pinnedIds, recentIds).slice(0, 9),
    [catalog, pinnedIds, recentIds]
  );
  const searchCommands = useMemo(
    () => rankCommands(catalog, query, pinnedIds, recentIds),
    [catalog, query, pinnedIds, recentIds]
  );
  const launcherSections = useMemo(
    () => projectLauncherSections(launcherCommands, pinnedIds, recentIds).map(([id, label, sectionCommands]) => ({
      id,
      label,
      entries: sectionCommands.map((command) => ({
        command,
        index: launcherCommands.indexOf(command)
      }))
    })),
    [launcherCommands, pinnedIds, recentIds]
  );
  const activeCommands = mode === "search" ? searchCommands : launcherCommands;
  const selectedCommand = activeCommands[selectedIndex] || null;
  const actionContext = actionsContextCommand || selectedCommand;
  const developerTestActions = useMemo(
    () => getDeveloperTestActionPresentation(actionContext?.id),
    [actionContext?.id]
  );
  const filteredActions = useMemo(() => {
    const normalizedQuery = actionQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return developerTestActions;
    return developerTestActions.filter(({ label, description }) => (
      `${label} ${description}`.toLocaleLowerCase().includes(normalizedQuery)
    ));
  }, [actionQuery, developerTestActions]);
  const selectedAction = filteredActions[selectedActionIndex] || null;
  const eventFeedback = status
    ? { visible: status, accessible: status, error: true }
    : isExecuting
      ? { visible: "Running command…", accessible: "Running command…", error: false }
      : actionAcknowledgement;

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
      setHoveredCommandId(null);
      setIsExecuting(false);
      setActionsOpen(false);
      setActionsContextCommand(null);
      setActionQuery("");
      setSelectedActionIndex(0);
      setHoveredActionIndex(null);
      setActionAcknowledgement("");
      setAttachedPanelGeometry(null);
      refreshCatalog();
      requestAnimationFrame(() => shellRef.current?.focus());
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    setStatus("");
    setHoveredCommandId(null);
    requestAnimationFrame(() => {
      if (mode === "search") searchRef.current?.focus();
      else shellRef.current?.focus();
    });
  }, [mode]);

  useEffect(() => {
    setSelectedIndex(0);
    setHoveredCommandId(null);
  }, [query]);

  useEffect(() => {
    if (!actionsOpen) return;
    setSelectedActionIndex(0);
    setHoveredActionIndex(null);
    setActionAcknowledgement("");
  }, [actionQuery, actionsOpen]);

  useEffect(() => {
    if (!actionsOpen) return;
    setSelectedActionIndex((current) => Math.min(current, Math.max(0, filteredActions.length - 1)));
  }, [actionsOpen, filteredActions.length]);

  useEffect(() => {
    if (!actionsOpen) return;
    requestAnimationFrame(() => actionsSearchRef.current?.focus());
  }, [actionsOpen]);

  useLayoutEffect(() => {
    if (!actionsOpen) {
      api.closeAttachedActions();
      setAttachedPanelGeometry(null);
      return undefined;
    }
    const panel = actionsPanelRef.current;
    const main = mainSurfaceRef.current;
    const selectedRow = main?.querySelector(`[data-command-index="${selectedIndex}"]`);
    if (!panel || !main || !selectedRow) {
      failAttachedActions();
      return undefined;
    }

    const mainRect = main.getBoundingClientRect();
    const selectedRect = selectedRow.getBoundingClientRect();
    const metrics = {
      anchorY: Math.round(selectedRect.top - mainRect.top + selectedRect.height / 2),
      contentHeight: Math.round(panel.getBoundingClientRect().height)
    };
    let active = true;
    Promise.resolve(api.openAttachedActions(metrics))
      .then((geometry) => {
        if (!active) return;
        if (!geometry) {
          failAttachedActions();
          return;
        }
        setAttachedPanelGeometry(geometry);
      })
      .catch(() => {
        if (active) failAttachedActions();
      });
    return () => {
      active = false;
    };
  }, [actionsOpen, filteredActions.length, mode, selectedIndex]);

  useEffect(() => {
    if (!actionAcknowledgement || status || isExecuting) return undefined;
    const timeout = window.setTimeout(() => {
      setActionAcknowledgement("");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [actionAcknowledgement, status, isExecuting]);

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

    const reordered = rankCommands(catalog, mode === "search" ? query : "", next, recentIds);
    const nextIndex = reordered.findIndex((command) => command.id === commandId);
    setSelectedIndex(mode === "launcher" && nextIndex >= 9 ? 0 : Math.max(0, nextIndex));
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
      setIsExecuting(false);
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
        setIsExecuting(false);
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

  function openActions() {
    if (!selectedCommand) return;
    setActionsContextCommand(selectedCommand);
    setActionsOpen(true);
    setActionQuery("");
    setSelectedActionIndex(0);
    setHoveredActionIndex(null);
    setActionAcknowledgement("");
    setHoveredCommandId(null);
  }

  function closeActions() {
    api.closeAttachedActions();
    setActionsOpen(false);
    setActionsContextCommand(null);
    setActionQuery("");
    setSelectedActionIndex(0);
    setHoveredActionIndex(null);
    setActionAcknowledgement("");
    setAttachedPanelGeometry(null);
    requestAnimationFrame(() => (mode === "search" ? searchRef.current : shellRef.current)?.focus());
  }

  function failAttachedActions() {
    setStatus("Actions panel is unavailable.");
    closeActions();
  }

  function toggleActions() {
    if (actionsOpen) closeActions();
    else openActions();
  }

  function moveActionSelection(delta) {
    if (filteredActions.length === 0) return;
    setActionAcknowledgement("");
    setSelectedActionIndex((current) => Math.max(0, Math.min(current + delta, filteredActions.length - 1)));
  }

  function acknowledgeAction(action) {
    if (!action) return;
    setActionAcknowledgement({
      visible: `Selected ${action.label}`,
      accessible: `Selected ${action.label} — execution is not connected in this preview.`,
      error: false
    });
  }

  function handleKeyDown(event) {
    if (actionsOpen) {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        closeActions();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeActions();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        moveActionSelection(1);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveActionSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        const actionTrigger = event.target.closest?.(".action-row");
        if (event.target.closest?.("button") && !actionTrigger) return;
        event.preventDefault();
        acknowledgeAction(selectedAction);
        return;
      }
      return;
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      openActions();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (mode === "search") goToLauncher();
      else api.hidePalette();
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
      const commandTrigger = event.target.closest?.(".command-row");
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

  const selectedPinned = Boolean(selectedCommand && pinnedIds.has(selectedCommand.id));
  const handleCommandHover = (command) => {
    setHoveredCommandId(command.id);
  };
  const handleCommandLeave = () => {
    setHoveredCommandId(null);
  };
  const handleCommandFocus = (command, index) => {
    setSelectedIndex(index);
  };
  const handleActionHover = (index) => setHoveredActionIndex(index);
  const handleActionLeave = () => setHoveredActionIndex(null);
  const handleActionFocus = (index) => {
    setSelectedActionIndex(index);
    setActionAcknowledgement("");
  };

  return (
    <main
      ref={shellRef}
      className={browserPreview ? "palette-shell browser-preview" : "palette-shell"}
      data-mode={mode}
      data-actions-open={actionsOpen || undefined}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div ref={mainSurfaceRef} className="palette-main" inert={actionsOpen ? "" : undefined}>
        {mode === "launcher" && (
          <section className="launcher-view" aria-label="Launcher">
            <button type="button" className="launcher-search" onClick={() => enterSearch("")} aria-label="Search commands">
              <Icon name="search" size={17} />
              <span>Search commands…</span>
            </button>
            <div className="launcher-content">
              {launcherCommands.length > 0 ? (
                <div className="launcher-list" role="listbox" aria-label="Commands">
                  {launcherSections.map(({ id, label, entries }) => (
                    <section key={id} className="command-section" aria-labelledby={`launcher-${id}`}>
                      <h2 id={`launcher-${id}`}>{label}</h2>
                      {entries.map(({ command, index }) => (
                        <CommandRow
                          key={command.id}
                          command={command}
                          index={index}
                          pinned={pinnedIds.has(command.id)}
                          selected={index === selectedIndex}
                          hovered={hoveredCommandId === command.id}
                          accessibleDescription={getCommandAccessibleDescription(command, commands, bindings)}
                          keycap={index + 1}
                          onHover={handleCommandHover}
                          onLeave={handleCommandLeave}
                          onFocus={handleCommandFocus}
                          onBlur={() => {}}
                          onClick={executeInteraction}
                          onContextMenu={executeInteraction}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No commands registered</strong>
                  <span>Registered command metadata will appear here automatically.</span>
                </div>
              )}
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
            <h2 className="list-heading">RESULTS</h2>
            <div className="command-list" role="listbox" aria-label="Search results">
              {searchCommands.map((command, index) => (
                <CommandRow
                  key={command.id}
                  command={command}
                  index={index}
                  pinned={pinnedIds.has(command.id)}
                  selected={index === selectedIndex}
                  hovered={hoveredCommandId === command.id}
                  accessibleDescription={getCommandAccessibleDescription(command, commands, bindings)}
                  onHover={handleCommandHover}
                  onLeave={handleCommandLeave}
                  onFocus={handleCommandFocus}
                  onBlur={() => {}}
                  onClick={executeInteraction}
                  onContextMenu={executeInteraction}
                />
              ))}
              {searchCommands.length === 0 && (
                <div className="empty-state">
                  <strong>No matching commands</strong>
                  <span>Try another command name or editing verb.</span>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="palette-footer-area">
          <footer className="palette-footer">
            <button className="footer-control footer-icon" type="button" onClick={() => api.openSettings()} aria-label="Settings" title="Settings">
              <Icon name="settings" size={16} />
            </button>
            <button
              className={selectedPinned ? "footer-control footer-icon active" : "footer-control footer-icon"}
              type="button"
              onClick={toggleSelectedPin}
              aria-label={selectedCommand ? `${selectedPinned ? "Unpin" : "Pin"} ${selectedCommand.name}` : "Pin selected command"}
              aria-pressed={selectedPinned}
              disabled={!selectedCommand}
              title={selectedCommand ? `${selectedPinned ? "Unpin" : "Pin"} ${selectedCommand.name}` : "Pin selected command"}
            >
              <Icon name="pin" size={15} />
            </button>
            <span className="footer-spacer" aria-hidden="true" />
            <button
              className={actionsOpen ? "footer-control footer-action footer-actions active" : "footer-control footer-action footer-actions"}
              type="button"
              onClick={toggleActions}
              aria-label={actionsOpen ? "Close selected command actions" : "Open selected command actions"}
              aria-keyshortcuts="Control+K"
              aria-pressed={actionsOpen}
              disabled={!selectedCommand}
              title={actionsOpen ? "Close Actions (Ctrl+K)" : "Open Actions (Ctrl+K)"}
            >
              <span className="footer-actions-keycaps" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd></span>
              <span>Actions</span>
            </button>
          </footer>
        </div>
      </div>

      {actionsOpen && (
        <section
          ref={actionsPanelRef}
          className="actions-panel"
          style={{
            top: `${attachedPanelGeometry?.panelTop ?? 8}px`,
            "--actions-arrow-top": `${Math.max(0, (attachedPanelGeometry?.anchorY ?? 80) - (attachedPanelGeometry?.panelTop ?? 8) - 7)}px`
          }}
          aria-label={`Actions for ${actionContext?.name || "selected command"}`}
        >
          <span className="actions-panel-arrow" aria-hidden="true" />
          <div className="search-control actions-search-control">
            <Icon name="search" size={18} />
            <input
              ref={actionsSearchRef}
              value={actionQuery}
              onChange={(event) => setActionQuery(event.target.value)}
              placeholder="Search actions"
              aria-label="Search selected-command actions"
              spellCheck="false"
              autoComplete="off"
            />
          </div>
          <h2 className="list-heading">ACTIONS</h2>
          <div className="actions-list" role="listbox" aria-label={`Actions for ${actionContext?.name || "selected command"}`}>
            {filteredActions.map((action, index) => (
              <ActionRow
                key={`${action.label}-${index}`}
                action={action}
                index={index}
                selected={index === selectedActionIndex}
                hovered={hoveredActionIndex === index}
                onHover={handleActionHover}
                onLeave={handleActionLeave}
                onFocus={handleActionFocus}
                onClick={acknowledgeAction}
              />
            ))}
            {developerTestActions.length === 0 && (
              <div className="empty-state">
                <strong>No contextual actions</strong>
                <span>Actions will appear here when a formal action contract is available.</span>
              </div>
            )}
            {developerTestActions.length > 0 && filteredActions.length === 0 && (
              <div className="empty-state">
                <strong>No matching actions</strong>
                <span>Try another action name or description.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {eventFeedback && (
        <div className={eventFeedback.error ? "palette-event-feedback error" : "palette-event-feedback"} role="status" aria-live="polite" aria-label={eventFeedback.accessible}>
          {eventFeedback.visible}
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
