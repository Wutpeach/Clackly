# Complete Windows Workflow ZIP

`package.js` builds only `Clackly-Workflow-<version>-win-x64.zip` with one top-level `plugin/`. It flattens verified `release/win-unpacked/resources/app` and managed Runtime into that tree, overlays the pinned official SamplePlugin native in its temporary staging tree, and verifies complete file inventory, hashes, Runtime locks and package/manifest/version identity before retaining the ZIP. The standalone Electron executable and Beta wrapper are excluded.

## Official build input

The owner supplies a controlled Actions artifact containing exactly `official-workflow-sdk.zip` at its root. The ZIP preserves the official Workflow Integrations relative layout, including `Examples/SamplePlugin/WorkflowIntegration.node`; retain the adjacent official README/changelog/terms as source evidence. Set the exact originating `CLACKLY_VENDOR_RUN_ID` and `CLACKLY_VENDOR_ARTIFACT_NAME` repository variables only during separately authorized activation, and commit its SHA-256 as `sourceArchiveSha256` in `vendor-qualification.json`. Do not use a user-selected URL or fetch a guessed public SDK download.

The checked native identity is Windows x64 PE, 397752 bytes, SHA-256 `ef89bf3c4bbcee7a273ac3d73bc366319b41c5aff644db3b09dc8fd385b7f444`, from the official local `Developer/Workflow Integrations/Examples/SamplePlugin`. The source archive pin is currently unset: no approved artifact was supplied or uploaded in R3. Missing artifact variables or an unset archive pin leave main CI packaging pending. Malformed configuration, expired artifacts, wrong archive bytes or wrong native bytes fail the relevant check/build; tag release builds still require every input.

Local commands from the application root:

```powershell
node scripts/workflow-release/provision.js --archive <official-workflow-sdk.zip> --output <new-sdk-directory>
npm run package:win
npm run package:verify
npm run workflow:release -- --nonpublishable --source-root <sdk-directory> --output <new-output-directory>
node scripts/workflow-release/package.js --verify <Clackly-Workflow-X.Y.Z-win-x64.zip>
```

For a supplied official local directory, the first provisioning command is unnecessary; `--source-root` still verifies the native pin. Local-development ZIPs record the actual commit plus dirty state and `publishable:false`. They are not evidence of a tagged release.

## CI and publication boundary

Main/PR always run tests, renderer build and release-tool fixture tests independently of SDK readiness. Main pushes check the owner-provisioned SDK configuration: missing artifact variables or a null/absent archive pin produce an explicit pending summary/notice and a skipped complete-package job. Configured but malformed inputs fail readiness. Once configured, the separate complete-package job must download and verify the pinned SDK and complete ZIP successfully; expired/missing artifacts or invalid bytes still fail. PRs skip the proprietary-input jobs. Main creates the same complete ZIP format marked nonpublishable, not a second package format. A skipped package job does not claim that a complete ZIP was built or verified.

Tag CI requires the exact clean `v<package.json version>` commit, matching Workflow manifest, complete payload and once-reviewed public redistribution evidence. SDK version/Resolve test matrix may be recorded as evidence but are not mechanical V1 build gates. Public release is currently blocked: the 2026-10-15 adjacent official terms review found no explicit public redistribution grant, and the archive input has not been provisioned. Do not invent an approval or repeat broad legal research; obtain clear owner/vendor evidence before changing the existing redistribution status. Attribution is not permission.

The tag job uploads the single verified ZIP; `CLACKLY_ENABLE_DRAFT_RELEASE` remains default-disabled. If separately activated, only an unpublished draft is created from that same build artifact, with exact tag, commit and SHA-256 recorded. V1 relies on fixed official repository ownership/HTTPS, exact release identity, digest and full content checks. Detached attestations are optional, not an installation prerequisite; digest/inventory alone do not authenticate a publisher independently of the official repository. Protect repository/tag/workflow access.

No remote Runner, tag, SDK upload, variables/Secrets change or draft/public Release was executed during local R3 verification.
