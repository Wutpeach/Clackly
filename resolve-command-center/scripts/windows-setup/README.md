# Historical standalone Windows Setup (R26–R29)

This directory retains the superseded standalone installer research. The current
Settings update and Windows installation path uses [Inno Setup](../inno-setup/README.md).
The fixed 0.1.3 pins, R28/R29 protected paths and trial instructions below are
historical; do not use them to install or update current Clackly. Keeping these
sources does not enable a production installer or certify the old trials.
Round-specific tests require their matching build closure; they are not the
current Inno acceptance suite. Retain the historical source and tests together.

## Retained worktree changes recorded on 2026-11-05

| Files | Purpose |
| --- | --- |
| `Build.ps1`, `BuildLauncher.ps1` | Build the managed variants and pinned native launcher. |
| `Setup.cs`, `SetupLaunch.cs`, `SetupLauncher.cpp`, `SetupHandoff.h` | Historical supervisor, protected-path checks, native CLR host and one-use UAC handoff. |
| `SetupBackend.psm1`, `SetupPipeline.psm1`, `SetupQualification.psm1`, `SetupTrust.psm1` | Historical source verification, transaction orchestration, completion-history checks and read-only trust diagnostics. |
| `Setup.test.ps1`, `Setup.R24.test.ps1`, `Setup.R26.test.ps1`, `Setup.R27.test.ps1`, `Setup.R28.test.ps1`, `Setup.R29.test.ps1`, `Setup.Native.test.ps1` | Round-specific isolated tests retained with the sources they exercise. |
| `README.md`, `MANUAL-ACCEPTANCE.zh-CN.md` | Historical design, limitations and trial records. |
| `../workflow-update/ExecutorSupport.psm1` | Retained shared helper: a fresh install probes directory creation on the scan root without requiring deletion of that root. |

These are source, test and documentation changes, not disposable generated
artifacts. This checkpoint does not remove installation records, backups,
build evidence or user data, and does not run a trial or request elevation.

Offline checks for this checkpoint: 14 changed PowerShell files parsed; the
candidate, fixture and trial C# variants compiled without package resources;
the native launcher and inert fixture compiled, with 23 native inert checks
passing. The retained WorkflowTransaction focused suite passed 35 cases, and
current Inno input/opening checks passed 3 cases. A separate temporary ACL
fixture passed 3 checks: fresh scan creation works without DELETE, an existing
target still requires DELETE, and probes leave files and ACLs unchanged. The
initial ACL fixture was corrected to deny parent delete-child rights as well
as target DELETE, and to expect the actual Win32 access-denied exception.
These checks do not establish a runnable full old package, real UAC/installation
or legacy GUI acceptance. Evidence and temporary harnesses are under the ignored
`../../build/legacy-setup-review/` and `../../build/test-evidence/installer/`.

## Historical R28 controlled trial preparation

R28 keeps Full staging and the ordinary candidate real-installation gate. See
[人工验收准备](MANUAL-ACCEPTANCE.zh-CN.md) for production blockers and the future
user checklist. These local EXEs are not authorized for real installation in this round. The distinct CONTROLLED-TRIAL is for later review and explicit one-time clean-machine approval, not public distribution.

The ordinary x64 WinForms EXE accepts no command-line overrides. Its GUI verifies
the embedded original official ZIP and keeps real installation locked. The sole
immutable production mutation gate is in Assert-SetupExecutionScope, before real
Host discovery, Native provisioning, write-access checks and transaction writes.
There is no runtime enabling argument. asInvoker, unsigned and unpublished are
properties of this candidate, not evidence of production acceptance.

Beyond that gate, normal and inert providers call the same Install body, context
construction, existing WorkflowTransaction engine and baseline Inspector. Providers
fix physical roots and Host/Native/access observations; no fixture Proof,
Reconciliation receipt or protected/DPAPI boolean grants installation authority.
R22 did not have this complete normal path: its retained outcome was BLOCKED.

The common normal route supports fresh and consecutive upgrades. Only its own
successful history with a post-worker independent Inspector .completed receipt
is eligible: exact terminal/current and previous journals, exited owner, full
old backups and new trees, namespaces and one increasing version/hash chain are
revalidated. Earlier new trees are found in the next transaction's complete
backup. Completion JSON is consistency evidence, never publisher or admin
authority; protected production storage remains a release prerequisite. Unknown
or pre-R27 history, rollback remnants, pointers/requests, legacy backups and scan
remnants still stop installation. No history is removed or retrospectively
certified. This does not reconcile the current machine's orphan.

## Mechanism and limits

The worker holds the adapter lock. Preparation briefly holds install.lock, then
releases it so the sole existing transaction engine reacquires it. This handoff
is not continuous exclusion. Under the actual engine lock, before-stage,
after-stage and backup-intent recheck the bound baseline, all global/retained
namespaces and exact phase-specific own artifacts. Journal id, paths, candidate,
old tree and actual worker PID/start must match. Unrelated history and every
unexpected .json.next fail closed before replacement. The engine retains its
own repeated Host checks, Native/package checks, backup, activation and rollback.

Configuration and DPAPI roots are excluded from every write root. Actual complete
file hashes and recursive namespaces, including empty directories, are observed
before mutation and checked again. The old tree/backup and prepared new tree also
bind recursive namespace digests. A digest enumerates the full namespace; it is
not a count or a fixture protection assertion. This proves preservation by
exclusion and observation, not ACL/ADS/DPAPI recovery-copy protection.

Worker terminal stdout is bound to its actual PID/start. The supervisor keeps
baseline/context/result/journal SHA-256 digests in memory, drains stdout after
actual worker exit and launches a fresh fixed Inspector. Missing terminal,
still-live worker, changed evidence, conflicting history or actual file/namespace
drift cannot establish installed. Inspector derives fixed paths, checks the
witness, invokes existing engine state validation, then holds both adapter and
engine locks while rechecking witness, retained/global state, journal owner and
full active/backup trees. It does not call the engine reentrantly under its lock.

Cancellation is honored before backup-intent. Later cancellation cannot interrupt
replacement. Permission/UAC denial and cancellation tests inject inert failures;
no real prompt, elevation, Resolve action or vendor Native execution occurs.
The lifecycle tests prove inert Host natural exit and actual starter/supervisor/
worker/Inspector behavior; they do not prove real Resolve Job-object lifetime.

## Build and verification

Run Windows PowerShell 5.1 from the repository root:

    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Build.ps1 -Archive <original-official-ZIP> -FixtureMetadata <retained-official-readback-JSON>
    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Setup.R27.test.ps1 -BuildDirectory resolve-command-center/build/windows-setup-r27
    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Setup.R24.test.ps1 -BuildDirectory resolve-command-center/build/windows-setup-r27
    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Setup.test.ps1 -Mode Backend -BuildDirectory resolve-command-center/build/windows-setup-r27
    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Setup.test.ps1 -Mode Gui -GuiScenarios fresh,survival -BuildDirectory resolve-command-center/build/windows-setup-r27

Outputs are under build/windows-setup-r28; old outputs remain untouched. No R28 online Verify is needed for local trust changes; R26's online PASS is historical.
Archive
and fixture metadata are explicit build inputs, never runtime installation
overrides. The archive must match the immutable size/hash pin; retained metadata
is only fixture input and cannot enable normal production installation.
BuildIdentity records the exact source
and embedded-resource maps, HEAD, compiler, unsigned/asInvoker and the distinct gate per variant. The trial backend transformation records both original and transformed resource hashes.
Rebuilds retain the preceding binary/closure under attempts. Every test attempt
keeps its unique report and inert directory, including failures. validation-index
identifies which tests used the exact final sources/EXEs; preliminary positives
are not final artifact evidence. All R21/R22/R23 outputs remain intact; the
historical Setup.R23.test.ps1 also remains unchanged.

The common source checks enforce Release 428867234, Asset 691653752, 32,601,075
bytes, SHA-256 425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640,
publishable inventory, Runtime and payload commit
a2315fb20225beb919f1c6c4d1a80d04dc7e9cd9. That commit identifies only the official
Workflow ZIP. Ordinary verification fetches the fixed GitHub API over TLS.
Setup uses one fixed Release-ID HTTPS GET without tag rediscovery, then verifies
the pinned original ZIP and its full inventory, version/source and Runtime.
Failed operations retain a bounded original exception chain in local evidence;
diagnostics cannot change terminal authority or grant installation permission.
Compiled fixtures use retained authenticated R24 metadata and the actual original
ZIP. Smaller direct-module tests use explicitly labelled synthetic data under a
physical marked temp/Clackly-R24-Fixtures root. Neither ordinary/fixture entry exposes a
synthetic-source selector, executable path, target, script or enabling argument.

The R23 1,200-second failure stays historical even though its same worker later
naturally completed. R24 keeps one fixed 1,800-second total budget per GUI case,
with 600 seconds each for source verification, stage copy/validation and each
Inspector phase; qualification/activation phases allow 300 seconds and inert
Host consent allows 120 seconds. These finite budgets derive from measured
26.8-second complete verification passes and the roughly 420-second research
physical copy. They never grow during a run. The observer records actual bound
phase events, journal changes and exact PID/start/image/CPU observations. CPU
activity without a checkpoint is separately labelled and cannot prove progress
or installation. A timeout saves the complete observer record and stops the suite
without killing, cancelling, cleaning or retrying the supervised task.

The UI displays real source, preparation, stage, replacement and independent
Inspector states with elapsed time. Worker and Inspector event sequences have
separate durable names and separate supervisor sequence counters. A phase event
never establishes installation; only the unchanged terminal/witness and actual
worker exit followed by independent Inspector can do so.

R24's narrow common Get-TreeFiles hot path binds real drive/root/recursive
directory handles during one observation. It enumerates actual names, refuses
reparse points and conflicting directory writes, then validates each leaf's
actual final path and attributes and hashes every byte through that same handle.
Complete namespace mode uses the same fresh traversal. All handles close after
each call; no eligibility or writable cache survives. Assert-NormalPath, single
link checks and every package/Runtime/lock/backup/rollback/Inspector pass remain.

ResourceMap verifies extracted fixed code and
read-only file/directory handles preserve that supervised closure. These measures
do not claim protection against a compromised user token.

The current 0.1.2 orphan rescue remains BLOCKED. Production unlock, real Host/
Native/access acceptance, protected trusted elevation, Explorer human
acceptance, SmartScreen and signed dual-asset publication remain separate Gates.
This round performs no real installation, recovery, pointer cleanup, protected
backup copy, ACL/Defender/config/DPAPI change, commit or publication. Refer to the
R24 task records and the Lead's current live findings for those boundaries.

## R29 current-computer clean trial trust boundary

The original managed Setup remains the only installer/transaction supervisor.
A small native CONTROLLED-LAUNCHER performs only protected identity checks,
consent/UAC and clean-environment CLR hosting. A managed EXE alone cannot
sanitize CLR startup inputs before loading the CLR. No daemon or second engine
is introduced. MSVC x64 /MT builds the launcher without a CLR dependency.

Both files must be separately approved by exact SHA and provisioned by an
administrator into the same fresh protected ProgramFiles/Clackly Setup R29
directory. The fixed filenames are Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe
and Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll. The managed DLL has no EXE
entry point. The native build embeds its exact final SHA. Mutable JSON/hash
manifests and caller-supplied SID/hash arguments are never authority.
The bootstrap checks owner/write/delete/permission ACLs, reparse/hardlink/final
paths and holds both files and all replaceable ancestors. Ancestor-only create
rights do not imply replacement rights; the launch directory must also deny
untrusted creation. Conservative checks can refuse unusual safe ACLs.

The native outer process asks consent before fixed self-RunAs, including on
machines whose Explorer already has a full administrator token. Windows decides
whether to show UAC; no UAC policy changes or automated approval occur. A one-use
local named pipe verifies OS peer PIDs, protected native image, same user SID,
elevated child token and a random challenge. The server binds the child PID to
ShellExecuteEx's process handle. The server may have a split or full token; the
child must be elevated. Alternate-account elevation and fabricated handoffs
refuse. Native code clears its own inherited environment before loading the
system .NET Framework CLR and invoking the DLL inside the same verified image.
The DLL verifies the actual process image rather than command-line assertions.
The native and managed code independently refuse user-SID token default owners, rather than
altering tokens/ACLs/policy; new files must have a trusted default owner.

Only a later authorized elevated run creates a new private session under the
protected launch directory with explicit Administrators/SYSTEM-only ACL. No
existing ACL is changed. Fixed embedded scripts/ZIP are extracted there, never
elevated from TEMP. Before each child, and independently inside worker/Inspector,
the protected DLL/session/code and all resources are rechecked and held. The
fixed system WindowsPowerShell binary is checked; its environment has private
TEMP and only fixed system module paths. The hash-checked script runs with
process-scoped ExecutionPolicy Bypass; no persistent machine/user policy changes.
The backend gate is transformed only at trial build time, with exact original
and transformed hashes. Candidate/fixture gates stay false. SetupTrust.psm1
remains the older read-only signed-readiness diagnostic, not trial authority.
The worker/Inspector hold canonical shared scan/ancestor directories against
replacement without requiring vendor directory owners or ACLs to change. Only
Clackly's transaction directory requires a private DACL; an absent directory is
created with that DACL, and an existing writable one is refused without ACL
repair. The existing target is checked as a path, not as executable installer
code, and is not held across activation so the sole engine can still move it.
Native probes run inside this private transaction directory. Strict protection
remains on the actual elevated launcher/DLL/scripts and executable Host code.

R29 tests distinguish actual inert handles, hashes, same-user pipe peers and
native-to-CLR execution from ACL/token/UAC policy simulations. NATIVE-INERT-TEST
never calls RunAs or starts the installer. Actual data removal, administrator
provisioning and installation require the user's separate on-site confirmation
of exact paths, impact and existing recovery ability. Old Clackly settings and
DPAPI may be discarded for this single clean reinstall; this does not establish
lossless upgrade acceptance. Shared Resolve/other-plugin paths remain excluded.
Record actual UAC, worker, Inspector and Resolve outcomes separately.

Additional checks against the exact final build:

    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Setup.R29.test.ps1 -BuildDirectory resolve-command-center/build/windows-setup-r29
    powershell.exe -NoProfile -File resolve-command-center/scripts/windows-setup/Setup.Native.test.ps1 -BuildDirectory resolve-command-center/build/windows-setup-r29
