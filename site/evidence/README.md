# Stage A evidence · 2026-11-08

Source branch: docs/issue-11-site. Website baseline: public v0.1.6. Original checkout main at f1069144933eb3fc626ea7a81c46116d331f1020 was clean and has not been changed.

## Verification

- Astro 7.3.8 / Starlight 0.41.7 / Black Theme 0.7.1 production build passed under Node 22.19.0.
- Static verification passed: 41 HTML pages, 19 matching Chinese/English documentation routes, 2,939 local URLs/assets/fragments and 19 byte-exact Developer Skill source exports with SHA-256 inventory.
- 12/12 Playwright tests passed against the built preview using headless Edge 156.0.4314.58 on Windows. Tests exercise both home-to-doc-to-AI routes, six prompts per language with real clipboard readback, clipboard denial recovery, authoritative Markdown retrieval/copy, locale-preserving language switch, Pagefind search, keyboard mobile navigation, theme switch, readable non-overlapping translated sidebar links, keyboard-scrollable mobile tables and responsive asset/error/overflow checks.
- Viewports captured: 1440, 390 and 320 pixels. No page error or asset HTTP error appeared in the responsive run.
- Original product screenshot was generated with the existing pinned-recent renderer evidence scenario. Main-to-v0.1.6 renderer source diff is empty. Screenshot data are deterministic fixtures; this is not a native Resolve capture.
- Mechanical design detector ran once over the four changed frontend files. It reported only advisory mismatches between literal neutral colors/type steps/radii and the summarized design tokens. No hard design bans were reported. Independent finish review is recorded in Issue #11/PR.
- git diff --check passed. No application functional change, installer build/download or live Resolve operation was needed.
- Final record check replaced an untracked local design-note reference with the committed renderer styles. The unmodified HarmonyOS Sans font includes its complete original copyright notice/license, linked from both homepages and documentation entry pages.

## Screenshots

All screenshots are from the actual built website at the local /Clackly/ base. Files are full-page captures; open their original size to inspect text.

| Surface | Desktop | Phone |
| --- | --- | --- |
| Chinese home | [1440px](desktop.png) | [390px](mobile.png), [320px](small.png) |
| English home | [1440px](desktop-en.png) | [390px](mobile-en.png) |
| Chinese installation | [1440px](docs-zh.png) | [390px](docs-mobile.png) |
| English AI guide | [1440px](docs-en.png) | [320px](docs-en-mobile.png) |
| Chinese prompts | [1440px](prompts.png) | — |
| Views protocol | — | [390px](reference-mobile.png) |

## Boundaries

No public Pages deployment is claimed. The GitHub Pages API returned 404 before work, so the default target remains https://wutpeach.github.io/Clackly/ pending authorized setup and deployment. Workflow publication is manual and defaults off; PR/main builds do not deploy. CI evidence and the precise reviewed commit are linked from Issue #11/PR after their runs.

Chinese user/developer guides are localized; authoritative technical protocol text stays in English with Chinese framing. Live Resolve tests, offline installer/UAC/uninstall acceptance and the future Cindy daily synchronization are outside this stage. Site build logs include benign upstream warnings for the optional empty i18n collection/default404 and a base-prefixed public font URL; built URL and browser checks verify the actual asset.

The visual design remains subject to the user's stage A product acceptance. No merge, website publication or daily schedule activation is authorized by these checks.
