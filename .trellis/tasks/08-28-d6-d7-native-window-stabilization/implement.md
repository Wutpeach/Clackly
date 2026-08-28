# Execution Plan

1. Inventory dirty hunks and identify the minimum D6/D7 implementation, renderer, and regression-test set.
2. Remove the temporary D7 trace recorder/analyzer and trace-only hooks without changing the accepted lifecycle.
3. Keep the focused D6/D7 regressions for constructor contracts, physical gap, opacity lifecycle, no-state close, constructor-only Panel focusability, and stale native blur handling.
4. Run focused Electron tests, the complete test suite, renderer build, syntax checks, diff checks, and staged-diff boundary scans.
5. Commit only the accepted D6/D7 files and task records; archive this task and record the work commit in the developer journal.
