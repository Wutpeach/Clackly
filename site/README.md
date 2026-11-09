# Clackly website

Independent product home and bilingual Astro/Starlight documentation for Issue #11, stage A. Public content baseline: v0.1.6 (2026-11-08). This directory changes no application behavior.

## Run locally

Use Node **22.19.0 or newer**. From this directory:

~~~text
npm ci
npm run build
npm test
npm run preview -- --port 4321
~~~

Open http://127.0.0.1:4321/Clackly/ (Chinese) or /Clackly/en/ (English). The Playwright config uses installed Edge on Windows and Chromium elsewhere. CI installs Chromium; locally use npx playwright install chromium if needed. npm run dev regenerates Skill sources before starting Astro.

## Sources and routes

- /Clackly/ and /Clackly/en/ are independent product pages, without redirects.
- Simplified Chinese is the explicit default (Starlight defaultLocale: root). Homepage x-default links point to /Clackly/; English remains available by explicit language switching or /Clackly/en/.
- Documentation opens in dark mode by default, matching the product home. The existing theme toggle retains an explicit light/dark choice across pages and reloads.
- /Clackly/docs/ and /Clackly/en/docs/ contain matching user/developer navigation.
- skills/clackly-developer/ is the protocol authority. scripts/sync-skill.mjs generates eight reference pages and exports all 19 Markdown/Python/JSON sources byte for byte. Generated content is ignored by Git. Edit the authority, not the exports.
- /Clackly/llms.txt lists all raw sources. Copy for Agent copies visible task prompts or exact original protocol Markdown; denied clipboard access leaves selected text and a recovery instruction.
- The Chinese protocol pages have Chinese framing and retain the authoritative English technical text. They are not an independently maintained translation of the protocol.

## Validation and publishing

npm run build checks generated HTML routes, local links/assets/fragments, CSS assets, bilingual coverage and Skill hashes. npm test drives actual built pages, search, language and theme controls, mobile navigation, clipboard success/failure and responsive widths from 320 to 1440 pixels.

.github/workflows/deploy-docs.yml provides independent Linux build/browser CI and an artifact containing the preview plus test evidence. PRs and main pushes **only build**. Pages deployment requires a manual workflow_dispatch with publish=true on main after explicit authorization. The public site is https://wutpeach.github.io/Clackly/. Issue #14 was accepted, merged and published on 2026-11-09; later documentation candidates require their own acceptance before publication.

Stage A received product acceptance and merge authorization on 2026-11-09 ([acceptance record](https://github.com/Wutpeach/Clackly/issues/11#issuecomment-6730597873)). Cindy scheduling is managed separately; this directory does not configure automations.

## Reused engineering

Adapted from Wutpeach/Ameow site/: Astro 7, Starlight 0.41, Black Theme, root/English locales, static HTML link checking, and mobile pagination wrapping. The Clackly home is newly implemented; Ameow's redirect-only root is not reused. No Ameow business copy, state, paths or schedule IDs are imported. See https://github.com/Wutpeach/Ameow/issues/19 for the later synchronization reference.

## Visual evidence provenance

The illustrated user guides use 12 bilingual, lossless WebP captures of the real Electron runtime. See [the Issue #16 audit and capture limits](evidence/issue-16/README.md) and [per-image provenance and SHA-256](public/images/docs/provenance.json). To reproduce on Windows, install dependencies in this directory and `../resolve-command-center`, build the application there, then run `node scripts/capture-docs-runtime.mjs` here. The script uses temporary AppData and the official Run Summary example without connecting to Resolve. It does not operate on user projects.

public/images/palette.png is an actual Clackly renderer capture with deterministic test data. It was produced headlessly with the existing palette-evidence utility (built renderer, pinned-recent scenario) and is labelled as demo data on both homepages. It does not prove native Resolve execution, Windows compositor behavior or production installation. Product wordmark, mark and HarmonyOS font come from the existing application assets. The documentation header uses the approved Satin Enamel A Compact SVG; browser favicons use its Micro SVG and multi-size Windows ICO. These three files are copied unchanged and checked by SHA-256 during build. The documentation brand link returns to the product home in the current language. No stock or AI-generated product screenshot is used. public/images/palette.png.json records the source.

Review screenshots and validation receipts are linked from Issue #11 and the PR. The site inherits the existing application's neutral surface, typography, logo, controlled corners and keyboard emphasis; the tracked [renderer styles](../resolve-command-center/electron/renderer/styles.css) provide the visual source. This work does not depend on untracked local design notes.

The product home uses HarmonyOS Sans © 2021 Huawei Device Co., Ltd. Its [complete license notice and agreement](public/fonts/HARMONYOS_SANS_LICENSE.txt) accompany the unmodified font and are linked from the homepages and documentation entry pages. Documentation uses Black Theme's native Geist Sans/Geist Mono, reading width and light/dark tokens, matching Ameow's theme setup.
