import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rendererDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(rendererDirectory, "../..");
const motionDirectory = path.join(rendererDirectory, "motion");
const ignoredDirectories = new Set(["node_modules", "dist", "release", ".git"]);
const rawMotionImport = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["'](?:motion|framer-motion)(?:\/[^"']*)?["']/g;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(entryPath);
    }
    return /\.(?:[cm]?js|jsx|mjs)$/.test(entry.name) ? [entryPath] : [];
  });
}

test("Motion dependency imports stay inside the Renderer-local foundation", () => {
  const imports = sourceFiles(packageRoot).flatMap((file) => {
    const matches = fs.readFileSync(file, "utf8").match(rawMotionImport) || [];
    return matches.map((statement) => ({ file, statement }));
  });

  assert.ok(imports.length > 0, "the local Motion foundation imports the reviewed dependency");
  for (const { file, statement } of imports) {
    const relativeFile = path.relative(packageRoot, file).replaceAll("\\", "/");
    assert.match(relativeFile, /^electron\/renderer\/motion\//, `${relativeFile} keeps ${statement} inside the local foundation`);
  }

  for (const prohibitedDirectory of ["electron/main", "workflow-plugin", "script-runtime"]) {
    const prohibitedImports = sourceFiles(path.join(packageRoot, prohibitedDirectory)).flatMap((file) => (
      fs.readFileSync(file, "utf8").match(rawMotionImport) || []
    ));
    assert.deepEqual(prohibitedImports, [], `${prohibitedDirectory} has no Motion dependency import`);
  }

  const app = fs.readFileSync(path.join(rendererDirectory, "App.jsx"), "utf8");
  const detachedPanel = fs.readFileSync(path.join(rendererDirectory, "DetachedInteractionPanelApp.jsx"), "utf8");
  assert.doesNotMatch(app, /from\s+["'](?:motion|framer-motion)/, "product Renderer consumes only the local foundation");
  assert.doesNotMatch(detachedPanel, /MotionBoundary|SoftPresence|from\s+["'](?:motion|framer-motion)/, "DetachedInteractionPanelApp remains outside the Motion boundary");
});

test("the local foundation exposes only immutable softPresence with strict reduced-motion ownership", () => {
  const boundary = fs.readFileSync(path.join(motionDirectory, "MotionBoundary.jsx"), "utf8");
  const presence = fs.readFileSync(path.join(motionDirectory, "softPresence.jsx"), "utf8");

  assert.match(boundary, /LazyMotion\s+features=\{domAnimation\}\s+strict/);
  assert.match(boundary, /MotionConfig\s+reducedMotion="user"/);
  assert.match(presence, /export const softPresence = Object\.freeze/);
  assert.match(presence, /duration:\s*0\.12/);
  assert.match(presence, /ease:\s*Object\.freeze\(\[0\.16, 1, 0\.3, 1\]\)/);
  assert.match(presence, /initial:\s*Object\.freeze\(\{ opacity: 0, y: 3 \}\)/);
  assert.match(presence, /animate:\s*Object\.freeze\(\{ opacity: 1, y: 0 \}\)/);
  assert.match(presence, /useReducedMotion\(\)/);
  assert.match(presence, /reducedMotion \? \{ opacity: softPresence\.initial\.opacity \} : softPresence\.initial/);
  assert.match(presence, /reducedMotion \? \{ opacity: softPresence\.animate\.opacity \} : softPresence\.animate/);
  assert.doesNotMatch(presence, /\b(?:domMax|spring|stagger|layout|layoutId)\b/);
});

test("Search retains CSS-owned feedback while its replaced mode keyframe is absent", () => {
  const app = fs.readFileSync(path.join(rendererDirectory, "App.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(rendererDirectory, "styles.css"), "utf8");
  const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));

  assert.match(app, /<SoftPresence className="search-view" ariaLabel=\{t\("palette\.search"\)\}>/);
  assert.doesNotMatch(styles, /mode-enter/);
  assert.doesNotMatch(styles.match(/\.search-view\s*\{[^}]*\}/)?.[0] || "", /animation:/);
  assert.match(styles, /\.launcher-search\s*\{[\s\S]*?transition:/);
  assert.match(styles, /\.footer-control\s*\{[\s\S]*?transition:/);
  assert.match(reducedMotion, /\.launcher-search,\s*\.footer-control,/);
  assert.match(reducedMotion, /transition-duration:\s*0ms/);
  assert.match(styles, /@keyframes status-spin/);
});
