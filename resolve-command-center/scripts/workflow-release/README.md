# Complete Windows Workflow ZIP

The single release asset is `Clackly-Workflow-<version>-win-x64.zip` with one top-level `plugin/` tree. It contains the application, built renderer and hash-locked managed Python Runtime. It excludes `WorkflowIntegration.node`, standalone Electron and the legacy Beta wrapper. A local ignored native file must never enter a staged application or archive.

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

No Resolve SDK, native module, vendor artifact, SDK download or native pin is required to build or verify this ZIP. Managed Python Runtime staging still downloads its hash-locked upstream assets. A development ZIP records the actual source commit and dirty state with `publishable:false`; it is not a tagged release.

The builder checks package/Workflow identities, production dependency locks, current installer/source bytes, managed Runtime provenance, complete inventory, ZIP paths/types/collisions/expansion and every file's bytes. The same lightweight release contract runs when Electron downloads or restores a retained candidate. Schema-v1/native-inclusive release assets are rejected.

## Initial installation

Keep the original official Release ZIP and run the reviewed checkout's fixed entry from the application root:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-workflow-plugin.ps1 -Archive "<downloaded-Workflow-ZIP>"
~~~

The entry independently refetches official Release metadata and verifies the exact original asset identity, size, SHA-256 and strict complete ZIP before local-native provisioning. An extracted directory cannot prove that asset digest and is not accepted for production installation. Development ZIPs are exercised with isolated test engines; no production bypass flag is provided.

The equivalent npm command is `npm run workflow:install:package -- "<downloaded-Workflow-ZIP>"`. In-app updates use fixed installed code; the candidate ZIP cannot select executable installer code. Restart Resolve yourself after activation. The initial entry and updates use the same local-native validation and transaction safeguards.

## CI and publication

Main and PR verification run source tests and a build, then build and verify the same native-free application/Runtime ZIP as a nonpublishable artifact. Packaging has no SDK readiness or owner-artifact prerequisite. Tag builds require the exact clean `v<package.json version>` commit and use the same schema-v2 ZIP with `publishable:true`.

The tag job uploads the single verified build artifact. The existing `CLACKLY_ENABLE_DRAFT_RELEASE` authorization gate remains default-disabled. When separately activated, it creates only an unpublished draft with exact tag, commit and SHA-256. Manual publication and real-host acceptance remain separate decisions. V1 relies on the fixed official repository and HTTPS, exact Release asset identity/digest and full content verification; a digest or inventory does not independently authenticate a publisher. Protect repository, tag and workflow access.
