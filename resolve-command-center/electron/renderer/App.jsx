/**
 * THESIS: A compact Resolve command menu keeps search primary and reveals interaction hints only on request.
 * OWN-WORLD: Near-black tonal layers, fine neutral hairlines, light selected anchors, and monochrome Lucide marks.
 * STORY: Launch a favorite, search a command, or inspect metadata-backed interactions without leaving the edit.
 * FIRST VIEWPORT: Search leads a truthful Pinned, Recent, and Commands list; secondary controls recede into one footer.
 * FORM: Dense Blender-style floating menu with local pointer hover and existing keyboard selection authority.
 */
import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  Bookmark,
  ChevronLeft,
  Command as CommandIcon,
  Flag,
  Image,
  Info,
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
import DetachedInteractionPanelApp from "./DetachedInteractionPanelApp.jsx";
import InteractionPanelContent from "./InteractionPanelContent.jsx";
import paletteGeometry from "../shared/palette-geometry.json";
import { getPaletteVisualStyle } from "./paletteVisualStyle.mjs";
import { shouldRenderBrowserPreviewAgentation } from "./browserPreview.mjs";
import { api } from "./api.mjs";
import { useLocalization } from "./LocalizationContext.jsx";
import { localizeCommands, presentError } from "../../localization/presentation.mjs";
import { createInteractionPanelPresentation } from "./interactionPanelPresentation.mjs";
import { getPaletteShadowPadding, usesDetachedNativePanel } from "./paletteDiagnostic.mjs";
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

const hasElectronHost = Boolean(window.resolveCommandCenter);
const browserPreview = !hasElectronHost;
const PALETTE_SHADOW_PADDING = paletteGeometry.shadowPadding;
const paletteShadowPadding = getPaletteShadowPadding({
  hasElectronHost,
  search: window.location.search,
  shadowPadding: PALETTE_SHADOW_PADDING
});
const detachedNativeInteractionPanel = usesDetachedNativePanel({
  hasElectronHost,
  search: window.location.search
});
const paletteVisualStyle = getPaletteVisualStyle(paletteShadowPadding);
const showBrowserPreviewAgentation = shouldRenderBrowserPreviewAgentation({
  hasElectronHost,
  pathname: window.location.pathname,
  search: window.location.search
});
const BrowserPreviewAgentation = lazy(() => import("./BrowserPreviewAgentation.jsx"));

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
  info: Info,
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

function getCommandAriaLabel(command, t) {
  const warning = getFeatureWarning(command.featureStatus, t);
  return warning ? `${command.name}, ${warning.message}` : command.name;
}

function getCommandAccessibleDescription(command, commands, bindings, t) {
  const interactionHelp = canExecuteCommand(command) ? getInteractionHelp(command, commands, bindings, t) : [];
  const interactionText = interactionHelp.map(({ label, description }) => `${label}: ${description}`).join(". ");
  return interactionText || getCommandHint(command, t) || command.description;
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

function CommandMeta({ command, pinned, labelRef, t }) {
  return (
    <>
      <span className="command-icon">
        <Icon name={command.icon} size={22} />
        {pinned && <span className="pin-indicator" aria-label={t("palette.pinnedStatus")} />}
      </span>
      <span ref={labelRef} className="command-name" title={command.name}>{command.name}</span>
      <span className="command-detail">
        <span className="command-category">{command.category}</span>
        {!canExecuteCommand(command) && (
          <span className="status-label">{t(`status.label.${getFeatureWarning(command.featureStatus, t)?.kind}`)}</span>
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
  onContextMenu,
  t
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
      aria-label={getCommandAriaLabel(command, t)}
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
      <CommandMeta command={command} pinned={pinned} labelRef={labelRef} t={t} />
      {keycap && <kbd aria-hidden="true">{keycap}</kbd>}
      {accessibleDescription && <span id={descriptionId} className="screen-reader-only">{accessibleDescription}</span>}
      <OverflowTooltip placement={placement} text={command.name} />
    </button>
  );
}

function PaletteApp() {
  const { effectiveLocale, t } = useLocalization();
  const shellRef = useRef(null);
  const mainSurfaceRef = useRef(null);
  const searchRef = useRef(null);
  const interactionPanelRef = useRef(null);
  const [mode, setMode] = useState("launcher");
  const [commands, setCommands] = useState([]);
  const [featureStatuses, setFeatureStatuses] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [hoveredCommandId, setHoveredCommandId] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  const [recentIds, setRecentIds] = useState(() => new Set());
  const [interactionPanelOpen, setInteractionPanelOpen] = useState(false);
  const [interactionPanelGeometry, setInteractionPanelGeometry] = useState(null);
  const localizedCommands = useMemo(() => localizeCommands(commands, effectiveLocale), [commands, effectiveLocale]);
  const catalog = useMemo(
    () => createPresentationCatalog(localizedCommands, featureStatuses),
    [localizedCommands, featureStatuses]
  );

  const launcherCommands = useMemo(
    () => rankCommands(catalog, "", pinnedIds, recentIds).slice(0, 9),
    [catalog, pinnedIds, recentIds]
  );
  const searchCommands = useMemo(
    () => rankCommands(catalog, query, pinnedIds, recentIds),
    [catalog, query, pinnedIds, recentIds]
  );
  const launcherSections = useMemo(
    () => projectLauncherSections(launcherCommands, pinnedIds, recentIds, t).map(([id, label, sectionCommands]) => ({
      id,
      label,
      entries: sectionCommands.map((command) => ({
        command,
        index: launcherCommands.indexOf(command)
      }))
    })),
    [launcherCommands, pinnedIds, recentIds, t]
  );
  const activeCommands = mode === "search" ? searchCommands : launcherCommands;
  const selectedCommand = activeCommands[selectedIndex] || null;
  const interactionRows = useMemo(
    () => (selectedCommand ? getInteractionHelp(selectedCommand, localizedCommands, bindings, t) : []),
    [selectedCommand, localizedCommands, bindings, t]
  );
  const hasSelectedCommand = Boolean(selectedCommand);
  const interactionPresentation = useMemo(
    () => createInteractionPanelPresentation(selectedCommand, interactionRows, effectiveLocale, t),
    [selectedCommand, interactionRows, effectiveLocale, t]
  );
  const eventFeedback = status
    ? { visible: status, accessible: status, error: true }
    : isExecuting
      ? { visible: t("palette.running"), accessible: t("palette.running"), error: false }
      : null;

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
          setFeatureStatuses(cachedStatuses);
        }
        const featureStatuses = await api.refreshFeatureStatuses();
        if (mounted) setFeatureStatuses(featureStatuses);
      } catch (error) {
        if (mounted) setStatus(presentError(error, t));
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
      setInteractionPanelOpen(false);
      setInteractionPanelGeometry(null);
      api.closeInteractionPanel();
      refreshCatalog();
      requestAnimationFrame(() => shellRef.current?.focus());
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    closeInteractionPanel(false);
    setSelectedIndex(0);
    setStatus("");
    setHoveredCommandId(null);
    requestAnimationFrame(() => {
      if (mode === "search") searchRef.current?.focus();
      else shellRef.current?.focus();
    });
  }, [mode]);

  useLayoutEffect(() => {
    closeInteractionPanel(false);
    setSelectedIndex(0);
    setHoveredCommandId(null);
  }, [query]);

  useLayoutEffect(() => {
    if (!interactionPanelOpen) return;
    closeInteractionPanel(false);
  }, [selectedCommand?.id]);

  useEffect(() => {
    if (!interactionPanelOpen || hasSelectedCommand) return;
    closeInteractionPanel(false);
  }, [hasSelectedCommand, interactionPanelOpen]);

  useEffect(() => {
    if (!interactionPanelOpen || detachedNativeInteractionPanel) return;
    requestAnimationFrame(() => interactionPanelRef.current?.focus());
  }, [interactionPanelOpen]);

  useLayoutEffect(() => {
    if (!interactionPanelOpen) {
      api.closeInteractionPanel();
      setInteractionPanelGeometry(null);
      return undefined;
    }
    const panel = interactionPanelRef.current;
    const main = mainSurfaceRef.current;
    const selectedRow = main?.querySelector(`[data-command-index="${selectedIndex}"]`);
    if (!panel || !main || !selectedRow) {
      failInteractionPanel();
      return undefined;
    }

    const mainRect = main.getBoundingClientRect();
    const selectedRect = selectedRow.getBoundingClientRect();
    const metrics = {
      anchorY: Math.round(selectedRect.top - mainRect.top + selectedRect.height / 2),
      contentHeight: Math.round(panel.getBoundingClientRect().height)
    };
    let active = true;
    const request = detachedNativeInteractionPanel
      ? { metrics, presentation: interactionPresentation }
      : metrics;
    Promise.resolve(api.openInteractionPanel(request))
      .then((geometry) => {
        if (!active) return;
        if (!geometry) {
          failInteractionPanel();
          return;
        }
        setInteractionPanelGeometry(geometry);
      })
      .catch(() => {
        if (active) failInteractionPanel();
      });
    return () => {
      active = false;
    };
  }, [interactionPanelOpen, interactionPresentation, interactionRows.length, mode, selectedIndex]);

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
    if (browserPreview) {
      openInteractionPanel();
      return;
    }
    if (!command.available) return;
    if (!canExecuteCommand(command)) {
      setStatus(getFeatureWarning(command.featureStatus, t)?.message || t("status.warning.unavailable"));
      if (getRecoveryAction(command.featureStatus) === "open-settings") {
        api.openSettings(command.capability);
      }
      return;
    }

    closeInteractionPanel(false);
    setIsExecuting(true);
    setStatus("");
    try {
      await api.executeCommand(command.id);
      setRecentIds((current) => new Set([command.id, ...current]));
      setIsExecuting(false);
    } catch (error) {
      setStatus(presentError(error, t));
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
    if (browserPreview) {
      openInteractionPanel();
      return;
    }
    if (!canExecuteCommand(command)) {
      setStatus(getFeatureWarning(command.featureStatus, t)?.message || t("status.warning.unavailable"));
      if (getRecoveryAction(command.featureStatus) === "open-settings") {
        api.openSettings(command.capability);
      }
      return;
    }

    closeInteractionPanel(false);
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
      setStatus(presentError(error, t));
      setIsExecuting(false);
      requestAnimationFrame(() => (mode === "search" ? searchRef.current : shellRef.current)?.focus());
    }
  }

  function moveSelection(delta) {
    if (activeCommands.length === 0) return;
    setSelectedIndex((current) => Math.max(0, Math.min(current + delta, activeCommands.length - 1)));
  }

  function restorePaletteFocus() {
    requestAnimationFrame(() => (mode === "search" ? searchRef.current : shellRef.current)?.focus());
  }

  function openInteractionPanel() {
    if (!hasSelectedCommand) return;
    setInteractionPanelOpen(true);
    setHoveredCommandId(null);
  }

  function closeInteractionPanel(restoreFocus = true) {
    api.closeInteractionPanel();
    setInteractionPanelOpen(false);
    setInteractionPanelGeometry(null);
    if (restoreFocus) restorePaletteFocus();
  }

  function failInteractionPanel() {
    setStatus(t("palette.panelUnavailable"));
    closeInteractionPanel();
  }

  function toggleInteractionPanel() {
    if (interactionPanelOpen) closeInteractionPanel();
    else openInteractionPanel();
  }

  function handleKeyDown(event) {
    if (interactionPanelOpen) {
      if (event.key === "Tab" || event.key === "Escape") {
        event.preventDefault();
        closeInteractionPanel();
        return;
      }
      return;
    }

    const commandSelectionHasFocus = event.target === shellRef.current || Boolean(event.target.closest?.(".command-row"));
    if (event.key === "Tab" && hasSelectedCommand && commandSelectionHasFocus) {
      event.preventDefault();
      openInteractionPanel();
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

  return (
    <main
      ref={shellRef}
      className={browserPreview ? "palette-shell browser-preview" : "palette-shell"}
      data-mode={mode}
      data-interaction-panel-open={interactionPanelOpen || undefined}
      style={paletteVisualStyle}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div ref={mainSurfaceRef} className="palette-main">
        {mode === "launcher" && (
          <section className="launcher-view" aria-label={t("palette.launcher")}>
            <button type="button" className="launcher-search" onClick={() => enterSearch("")} aria-label={t("palette.search")}>
              <Icon name="search" size={17} />
              <span>{t("palette.searchPlaceholderLauncher")}</span>
            </button>
            <div className="launcher-content">
              {launcherCommands.length > 0 ? (
                <div className="launcher-list" role="listbox" aria-label={t("palette.commands")}>
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
                          accessibleDescription={getCommandAccessibleDescription(command, localizedCommands, bindings, t)}
                          keycap={index + 1}
                          onHover={handleCommandHover}
                          onLeave={handleCommandLeave}
                          onFocus={handleCommandFocus}
                          onBlur={() => {}}
                          onClick={executeInteraction}
                          onContextMenu={executeInteraction}
                          t={t}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>{t("palette.noCommands")}</strong>
                  <span>{t("palette.noCommands.detail")}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {mode === "search" && (
          <section className="search-view" aria-label={t("palette.search")}>
            <div className="search-control">
              <Icon name="search" size={18} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("palette.searchPlaceholder")}
                aria-label={t("palette.search")}
                spellCheck="false"
                autoComplete="off"
              />
              <kbd>ESC</kbd>
            </div>
            <h2 className="list-heading">{t("palette.results")}</h2>
            <div className="command-list" role="listbox" aria-label={t("palette.results")}>
              {searchCommands.map((command, index) => (
                <CommandRow
                  key={command.id}
                  command={command}
                  index={index}
                  pinned={pinnedIds.has(command.id)}
                  selected={index === selectedIndex}
                  hovered={hoveredCommandId === command.id}
                  accessibleDescription={getCommandAccessibleDescription(command, localizedCommands, bindings, t)}
                  onHover={handleCommandHover}
                  onLeave={handleCommandLeave}
                  onFocus={handleCommandFocus}
                  onBlur={() => {}}
                  onClick={executeInteraction}
                  onContextMenu={executeInteraction}
                  t={t}
                />
              ))}
              {searchCommands.length === 0 && (
                <div className="empty-state">
                  <strong>{t("palette.noResults")}</strong>
                  <span>{t("palette.noResults.detail")}</span>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="palette-footer-area">
          <footer className="palette-footer">
            <button className="footer-control footer-icon" type="button" onClick={() => api.openSettings()} aria-label={t("palette.settings")} title={t("palette.settings")}>
              <Icon name="settings" size={16} />
            </button>
            <button
              className={selectedPinned ? "footer-control footer-icon active" : "footer-control footer-icon"}
              type="button"
              onClick={toggleSelectedPin}
              aria-label={selectedCommand ? t(selectedPinned ? "palette.unpin" : "palette.pin", { name: selectedCommand.name }) : t("palette.pinSelected")}
              aria-pressed={selectedPinned}
              disabled={!selectedCommand}
              title={selectedCommand ? t(selectedPinned ? "palette.unpin" : "palette.pin", { name: selectedCommand.name }) : t("palette.pinSelected")}
            >
              <Icon name="pin" size={15} />
            </button>
            <span className="footer-spacer" aria-hidden="true" />
            {hasSelectedCommand && (
              <button
                className={interactionPanelOpen ? "footer-control footer-icon footer-info active" : "footer-control footer-icon footer-info"}
                type="button"
                onClick={toggleInteractionPanel}
                aria-label={interactionPanelOpen ? t("palette.closeInfo") : t("palette.openInfo")}
                aria-controls="interaction-panel"
                aria-expanded={interactionPanelOpen}
                aria-pressed={interactionPanelOpen}
                title={interactionPanelOpen ? t("palette.closeInfo") : t("palette.commandInfo")}
              >
                <Icon name="info" size={16} />
              </button>
            )}
          </footer>
        </div>
      </div>

      {interactionPanelOpen && hasSelectedCommand && !detachedNativeInteractionPanel && (
        <section
          id="interaction-panel"
          ref={interactionPanelRef}
          className="interaction-panel"
          style={{
            "--interaction-panel-top": `${interactionPanelGeometry?.panelTop ?? 8}px`
          }}
          aria-label={t("interaction.ariaLabel")}
          tabIndex={-1}
        >
          <InteractionPanelContent presentation={interactionPresentation} previewNote={browserPreview ? t("interaction.preview") : null} />
        </section>
      )}

      {interactionPanelOpen && hasSelectedCommand && detachedNativeInteractionPanel && (
        <div ref={interactionPanelRef} className="interaction-panel-measure" aria-hidden="true">
          <InteractionPanelContent presentation={interactionPresentation} />
        </div>
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
  const view = new URLSearchParams(window.location.search).get("view");
  if (view === "interaction-panel") {
    return <DetachedInteractionPanelApp />;
  }
  if (view === "settings") {
    return <SettingsApp api={api} Icon={Icon} />;
  }

  return (
    <>
      <PaletteApp />
      {showBrowserPreviewAgentation && (
        <Suspense fallback={null}>
          <BrowserPreviewAgentation />
        </Suspense>
      )}
    </>
  );
}

export default App;
