export const PROTOTYPE_COMMANDS = [
  {
    id: "timeline.addFlag",
    name: "Add Flag",
    keywords: ["flag", "clip", "timeline"],
    category: "Timeline",
    shortcut: "G",
    icon: "flag",
    available: false
  },
  {
    id: "edit.bladeCut",
    name: "Blade Cut",
    keywords: ["blade", "cut", "split", "edit"],
    category: "Edit",
    shortcut: "B",
    icon: "blade",
    available: false
  },
  {
    id: "color.changeClipColor",
    name: "Change Clip Color",
    keywords: ["clip", "color", "label"],
    category: "Color",
    shortcut: "C",
    icon: "palette",
    available: false
  },
  {
    id: "gallery.exportStill",
    name: "Export Still",
    keywords: ["export", "still", "gallery", "frame"],
    category: "Gallery",
    shortcut: "E",
    icon: "export",
    available: false
  },
  {
    id: "project.findTimeline",
    name: "Find Timeline",
    keywords: ["find", "search", "timeline"],
    category: "Project",
    shortcut: "/",
    icon: "search",
    available: false
  },
  {
    id: "timeline.goToIn",
    name: "Go to In Point",
    keywords: ["go", "in", "point", "timeline"],
    category: "Timeline",
    shortcut: "I",
    icon: "in-point",
    available: false
  },
  {
    id: "audio.normalize",
    name: "Normalize Audio",
    keywords: ["audio", "normalize", "level"],
    category: "Audio",
    shortcut: "N",
    icon: "waveform",
    available: false
  },
  {
    id: "effects.openLibrary",
    name: "Open Effects",
    keywords: ["open", "effects", "library", "fx"],
    category: "Effects",
    shortcut: "F",
    icon: "spark",
    available: false
  }
];

const REAL_COMMAND_PRESENTATION = {
  "timeline.addMarker": {
    category: "Timeline",
    shortcut: "M",
    icon: "marker"
  }
};

export function createPresentationCatalog(realCommands) {
  const real = realCommands.map((command) => ({
    ...command,
    category: "Command",
    shortcut: "",
    icon: "command",
    available: true,
    ...REAL_COMMAND_PRESENTATION[command.id]
  }));

  return [...real, ...PROTOTYPE_COMMANDS];
}

function matches(command, query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = [command.id, command.name, ...(command.keywords || [])]
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
