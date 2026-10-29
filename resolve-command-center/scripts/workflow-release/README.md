# Complete Windows Workflow ZIP

The single release asset is `Clackly-Workflow-<version>-win-x64.zip` with one top-level `plugin/` tree. It contains the application, built renderer and hash-locked managed Python Runtime. It excludes `WorkflowIntegration.node`, standalone Electron and the legacy Beta wrapper. A local ignored native file must never enter a staged application or archive.

Application packaging selects production source roots and the fixed installer/module closure. Staged application and final ZIP verification refuse tests, fixtures, synthetic OTIO/AE outputs, diagnostics, private/task evidence and SDK/native material, even when their bytes appear in a complete hash inventory. There is no small-file or historical fixture exemption. Production dependencies, Runtime notices/provenance and complete inventory/runtime/source-staleness checks remain required.

`clackly-release.json` uses schema version 2. Its exact sorted file inventory describes the downloadable bytes; its native policy is:

~~~json
{"path":"workflow-plugin/WorkflowIntegration.node","provisioning":"local-resolve","source":"programdata-sampleplugin","platform":"win32","arch":"x64"}
~~~

Initial installation and updates independently validate the official local Resolve SamplePlugin component under Windows ProgramData and add its actual size/hash to the complete staged installation tree. The release manifest contains no native bytes, native hash pin or redistribution qualification. Missing, unsafe, corrupt or incompatible local components fail before an existing installation is backed up or switched. A previous plugin's native component is not a fallback. Resolve may be installed on a different drive from ProgramData.

## Local build

Run from the application root on Windows:

~~~powershell
npm ci
npm run package:win
npm run package:verify
node scripts/workflow-release/package.js --nonpublishable --output <new-output-directory>
node scripts/workflow-release/package.js --verify <Clackly-Workflow-X.Y.Z-win-x64.zip>
~~~

No Resolve SDK, native module, vendor artifact, SDK download or native pin is required to build or verify this ZIP. Managed Python Runtime staging still downloads its hash-locked upstream assets. A development ZIP records the actual source commit and dirty state with `publishable:false`; it is not a tagged release. Its `source.workflowPath` is `null` for a local build or the canonical workflow path identified by `GITHUB_WORKFLOW_REF` in CI. Main/PR artifacts identify `.github/workflows/main.yml`. Publishable generation requires the canonical Release workflow in addition to the existing clean exact-tag checks; main/local development provenance cannot qualify as a production release.

The builder checks package/Workflow identities, production dependency locks, current installer/source bytes, managed Runtime provenance, complete inventory, ZIP paths/types/collisions/expansion and every file's bytes. The same lightweight release contract runs when Electron downloads or restores a retained candidate. Schema-v1/native-inclusive release assets are rejected.

## Initial installation

Keep the original official Release ZIP and run the reviewed checkout's fixed entry from the application root:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-workflow-plugin.ps1 -Archive "<downloaded-Workflow-ZIP>"
~~~

The entry independently refetches official Release metadata and verifies the exact original asset identity, size, SHA-256 and strict complete ZIP before local-native provisioning. An extracted directory cannot prove that asset digest and is not accepted for production installation. Development ZIPs are exercised with isolated test engines; no production bypass flag is provided.

The equivalent npm command is `npm run workflow:install:package -- "<downloaded-Workflow-ZIP>"`. In-app updates use fixed installed code; the candidate ZIP cannot select executable installer code. Restart Resolve yourself after activation. The initial entry and updates use the same local-native validation and transaction safeguards.

The same fixed Archive installer also upgrades a recognized older Clackly installation and retains every old file. A legacy schema-v1 updater cannot install schema-v2 ZIPs; use the reviewed checkout's Archive route after publication and installation are separately authorized.

The console bootstrap prints a recovery transaction ID. From that same reviewed checkout, inspect or recover an interrupted transaction, or explicitly restore the retained previous version after a successful upgrade:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/workflow-update/bootstrap.ps1 -Operation Inspect -TransactionId <recorded-id>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/workflow-update/bootstrap.ps1 -Operation Recover -TransactionId <recorded-id>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/workflow-update/bootstrap.ps1 -Operation RestorePrevious -TransactionId <recorded-id>
~~~

RestorePrevious uses the fixed bootstrap pointer, journal, target and current paired host. It requires a verified successful upgrade and matching complete active/backup trees, retains the replaced new version, and refuses a running or unknown host and changed evidence. A first install with no prior version has nothing to restore. Bootstrap TransactionId and the in-app updater's RequestId are separate records; do not pass a bootstrap ID to recover.ps1. The console bootstrap does not elevate or close/restart Resolve.

## CI and publication

Main and PR verification independently report Node logic, serial real-subprocess/Windows integration, focused PowerShell transactions, each Python test directory, the renderer source build and the complete native-free application/Runtime ZIP. A failed test job does not prevent the packaging job from attempting its own build and verification. Packaging has no SDK readiness or owner-artifact prerequisite. The development artifact contains only the verified ZIP and a JSON record of its SHA-256, size, source/run identity and complete release manifest with Runtime/inventory evidence; upload requires `publishable:false`. Tag builds require the exact clean `v<package.json version>` commit and use the same schema-v2 ZIP with `publishable:true`.

The tag job uploads the single verified build artifact. The existing `CLACKLY_ENABLE_DRAFT_RELEASE` authorization gate remains default-disabled. When separately activated, it creates only an unpublished draft with exact tag, commit and SHA-256. Manual publication and real-host acceptance remain separate decisions. V1 relies on the fixed official repository and HTTPS, exact Release asset identity/digest and full content verification; a digest or inventory does not independently authenticate a publisher. Protect repository, tag and workflow access.
