import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(rendererDir, name), "utf8");

test("Settings keeps the existing two-pane contract while projecting the current Palette selection grammar", () => {
  const styles = read("styles.css");

  assert.match(styles, /\.settings-shell\s*\{[^}]*--settings-nav-width:[^}]*--settings-title-size:[^}]*--settings-keycap-size:/s);
  assert.match(styles, /\.settings-workspace\s*\{[^}]*grid-template-columns:\s*var\(--settings-nav-width\) minmax\(0, 1fr\)/s);
  assert.match(styles, /\.feature-detail\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) var\(--settings-footer-height\)/s);
  assert.match(styles, /\.settings-shell\s*\{[^}]*--settings-nav-row-height:\s*30px[^}]*--settings-selected:\s*var\(--color-palette-selected\)[^}]*--settings-selected-foreground:\s*var\(--color-palette-selected-foreground\)/s);
  assert.match(styles, /\.feature-button\.selected\s*\{[^}]*color:\s*var\(--settings-selected-foreground\)[^}]*background:\s*var\(--settings-selected\)[^}]*box-shadow:\s*none/s);
  assert.match(styles, /--color-palette-selected:\s*#e7e8ea;[\s\S]*--color-palette-selected-foreground:\s*#17191d;/);
  assert.doesNotMatch(styles, /--settings-selected-wash|inset 2px 0 var\(--color-accent\)/);
  assert.doesNotMatch(styles, /\.feature-button\.selected svg/);
  assert.match(styles, /\.feature-button:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--settings-focus\)/s);
  assert.doesNotMatch(styles, /--color-tile|--surface-inset|@media \(max-width: 680px\)|max-width:\s*520px/);
});

test("Settings uses compact shared paint for titlebar, status, fields, keycaps, and action strip", () => {
  const styles = read("styles.css");
  const app = read("SettingsApp.jsx");

  assert.match(app, /function InteractionHelpInput\(\{ label \}\)/);
  assert.match(app, /<kbd aria-hidden="true">\{token\}<\/kbd>/);
  assert.match(app, /className="feature-detail-icon" aria-hidden="true"><Icon name="settings" size=\{16\}/);
  assert.match(app, /className="feature-detail-icon" aria-hidden="true"><Icon name=\{selectedFeature\.icon\} size=\{16\}/);
  assert.match(styles, /\.feature-detail-icon\s*\{[^}]*width:\s*16px[^}]*height:\s*16px[^}]*color:\s*var\(--color-text-secondary\)/s);
  assert.match(styles, /\.settings-titlebar\s*\{[^}]*border-bottom:\s*1px solid var\(--settings-hairline\)[^}]*background:\s*var\(--color-palette-surface\)/s);
  assert.doesNotMatch(styles, /\.settings-titlebar\s*\{[^}]*linear-gradient/s);
  assert.match(styles, /\.feature-lifecycle\s*\{[^}]*border-top:\s*1px solid var\(--settings-hairline\)[^}]*border-bottom:\s*1px solid var\(--settings-hairline\)[^}]*background:\s*transparent/s);
  assert.doesNotMatch(styles, /\.feature-lifecycle\s*\{[^}]*border:\s*1px/);
  assert.match(styles, /\.settings-field input:not\(\[type="checkbox"\]\),[\s\S]*?height:\s*var\(--settings-control-height\)[\s\S]*?border-radius:\s*var\(--radius-toolbar\)[\s\S]*?background:\s*var\(--settings-control-surface\)/);
  assert.match(styles, /\.feature-help-input kbd\s*\{[^}]*height:\s*20px[^}]*font-size:\s*var\(--settings-keycap-size\)/s);
  assert.match(styles, /\.settings-actions\s*\{[^}]*padding:\s*4px 10px[^}]*border-top:\s*1px solid var\(--settings-hairline\)[^}]*background:\s*var\(--color-palette-surface\)/s);
  const footerRule = styles.match(/\.settings-actions\s*\{([^}]*)\}/s)?.[1] || "";
  assert.doesNotMatch(footerRule, /box-shadow/);
  assert.match(styles, /\.settings-shell\s*\{[^}]*--settings-title-size:\s*16px[^}]*--settings-section-size:\s*14px[^}]*--settings-label-size:\s*13px[^}]*--settings-body-size:\s*13px[^}]*--settings-status-size:\s*12px[^}]*--settings-meta-size:\s*11px[^}]*--settings-keycap-size:\s*10px/s);
});
