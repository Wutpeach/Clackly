export function joinFeatureStatuses(items, statuses) {
  const byId = new Map((statuses || []).map((status) => [status.id, status]));
  return items.map((item) => ({
    ...item,
    featureStatus: byId.get(item.capability || item.id) || null
  }));
}

export function isFeatureVisible(status) {
  return Boolean(status?.installed);
}

export function canExecuteFeature(status) {
  return Boolean(status?.installed && status.enabled && status.status === "ready");
}

export function getFeatureWarning(status, t = defaultT) {
  if (!status) return { kind: "loading", message: t("status.warning.loading") };
  if (!status.enabled) return { kind: "disabled", message: t("status.warning.disabled") };
  if (status.status === "ready") return null;
  return {
    kind: status.status,
    message: t(`status.warning.${status.status}`)
  };
}

export function getRecoveryAction(status) {
  return status?.details?.action === "open-settings" ? "open-settings" : null;
}

export function canExecuteCommand(command) {
  if (!command?.available) return false;
  return canExecuteFeature(command.featureStatus);
}

export function isCommandPresentable(command) {
  return Boolean(command) && command.presentation !== "internal";
}

export function createPresentationCatalog(realCommands, statuses = []) {
  return joinFeatureStatuses(realCommands, statuses)
    .filter((command) => isCommandPresentable(command))
    .filter((command) => isFeatureVisible(command.featureStatus))
    .map((command) => ({
    ...command,
    available: true
  }));
}

export function getInteractionHelpCommands(commands, capabilityId, bindings, t) {
  return commands
    .filter((command) => (
      command.capability === capabilityId && isCommandPresentable(command)
    ))
    .map((command) => ({ ...command, help: getInteractionHelp(command, commands, bindings, t) }))
    .filter((command) => command.help.length > 0);
}

export function getCommandHint(command, t) {
  if (!command) return "";
  const lifecycleWarning = command.featureStatus && getFeatureWarning(command.featureStatus, t);
  if (lifecycleWarning) return lifecycleWarning.message;
  return command.description || command.name || "";
}

export function getInteractionHelp(targetCommand, commands, bindings, t = defaultT) {
  if (!targetCommand || !Array.isArray(commands) || !Array.isArray(bindings)) return [];
  const commandsById = new Map(commands.map((command) => [command.id, command]));

  return bindings.flatMap((binding) => {
    if (binding.target !== targetCommand.id) return [];
    const actionCommand = commandsById.get(binding.action?.command);
    if (!actionCommand) return [];

    const button = binding.trigger?.button === "right" ? t("interaction.rightClick") : t("interaction.click");
    const modifiers = (binding.trigger?.modifiers || []).map((modifier) => ({
      CTRL: t("interaction.ctrl"),
      SHIFT: t("interaction.shift"),
      ALT: t("interaction.alt")
    })[modifier] || modifier);
    return [{
      label: [...modifiers, button].join(" + "),
      actionName: actionCommand.name,
      description: actionCommand.description
    }];
  });
}

function matches(command, query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = [command.id, command.name, ...(command.keywords || []), command.englishName, ...(command.englishKeywords || [])]
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function rankCommands(commands, query, pinnedIds = new Set(), recentIds = new Set()) {
  const normalizedQuery = query.trim().toLowerCase();

  return commands
    .filter((command) => matches(command, normalizedQuery))
    .map((command, sourceIndex) => ({
      command,
      sourceIndex,
      exact: normalizedQuery !== "" && (
        command.name.toLowerCase() === normalizedQuery || command.id.toLowerCase() === normalizedQuery
      ),
      pinned: pinnedIds.has(command.id),
      recent: recentIds.has(command.id)
    }))
    .sort((left, right) =>
      Number(right.exact) - Number(left.exact) ||
      Number(right.pinned) - Number(left.pinned) ||
      Number(right.recent) - Number(left.recent) ||
      left.sourceIndex - right.sourceIndex
    )
    .map(({ command }) => command);
}

export function projectLauncherSections(commands, pinnedIds = new Set(), recentIds = new Set(), t = defaultT) {
  const sections = {
    pinned: [],
    recent: [],
    commands: []
  };

  for (const command of commands) {
    if (pinnedIds.has(command.id)) {
      sections.pinned.push(command);
    } else if (recentIds.has(command.id)) {
      sections.recent.push(command);
    } else {
      sections.commands.push(command);
    }
  }

  return [
    ["pinned", t("palette.pinned"), sections.pinned],
    ["recent", t("palette.recent"), sections.recent],
    ["commands", t("palette.commands"), sections.commands]
  ].filter(([, , sectionCommands]) => sectionCommands.length > 0);
}

export function getCommandGroup(command) {
  const initial = command.name.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

export function groupCommands(commands) {
  const groups = new Map();
  const sorted = [...commands].sort((left, right) => left.name.localeCompare(right.name));

  for (const command of sorted) {
    const letter = getCommandGroup(command);
    const group = groups.get(letter) || [];
    group.push(command);
    groups.set(letter, group);
  }

  return [...groups.entries()].sort(([left], [right]) => {
    if (left === "#") return -1;
    if (right === "#") return 1;
    return left.localeCompare(right);
  });
}

export function getSettingsControl(field) {
  switch (field.type) {
    case "string":
      return { kind: "input", inputType: "text" };
    case "number":
      return { kind: "input", inputType: "number" };
    case "boolean":
      return { kind: "checkbox" };
    case "color":
      return { kind: "input", inputType: "color" };
    case "path":
    case "folder":
      return { kind: "picker", inputType: "text", pickerType: field.type };
    case "select":
      return { kind: "select", options: [...field.options] };
    default:
      throw new TypeError(`Unsupported settings field type: ${field.type}`);
  }
}

export function groupFeaturesByCategory(features) {
  const groups = new Map();
  for (const feature of features) {
    const group = groups.get(feature.category) || [];
    group.push(feature);
    groups.set(feature.category, group);
  }
  return [...groups.entries()];
}
import { translate } from "../../localization/resources.mjs";
const defaultT = (key, params) => translate("en", key, params);
