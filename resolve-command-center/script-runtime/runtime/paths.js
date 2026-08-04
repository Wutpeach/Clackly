const fs = require("node:fs");
const path = require("node:path");

function resolveRuntimeRoot({ appRoot }) {
  const canonicalAppRoot = fs.realpathSync(appRoot);
  const candidates = [
    path.join(canonicalAppRoot, "resources", "runtimes"),
    path.join(canonicalAppRoot, "..", "runtimes")
  ];

  return candidates.find((root) => fs.existsSync(path.join(root, "manifest.json")))
    || candidates[0];
}

module.exports = { resolveRuntimeRoot };
