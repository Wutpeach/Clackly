# Real-Host Acceptance

On 2026-08-29 the packaged candidate was installed before testing. The user
started After Effects and DaVinci Resolve, used a local Resolve project and an
open timeline, and exercised ordinary Export-to-AE through Clackly.

The initial candidate made the second and third exports clearly faster but the
first export still felt slower. After the helper was refined to perform and
discard one background enumeration, the package was rebuilt, verified, and
reinstalled with Resolve and After Effects closed.

The user then confirmed that the PowerShell prewarm version had a significant
effect and that the first export was much faster. This accepts the real-host
warm path and the first-export refinement. No generated-export or command
correctness regression was reported.
