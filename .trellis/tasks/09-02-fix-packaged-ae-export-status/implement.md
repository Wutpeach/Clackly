# Packaged AE Export Status Repair Implementation Plan

1. Load the backend quality contract and inspect every caller of `PythonProvider.checkAvailability()` before editing.
2. Extend the existing `AVAILABILITY_MESSAGES` table in `script-runtime/providers/PythonProvider.js` with the minimum controlled Runtime/Probe failures needed to distinguish Resolve bridge, managed-Python launch, and Probe/Protocol branches. Use static messages with stable codes; do not expose raw errors.
3. Extend the existing table-driven test in `script-runtime/providers/PythonProvider.test.js`. Keep one explicit unknown-error assertion proving unexpected failures still rethrow.
4. Run focused checks:
   - `node --test script-runtime/providers/PythonProvider.test.js feature-status/FeatureStatusManager.test.js`
   - `git diff --check`
5. Run repository gates from `resolve-command-center`:
   - `npm test`
   - `npm run build`
   - `npm run package:win`
   - `npm run package:verify`
   - `node --test scripts/internal-beta.test.js`
   - `npm run beta:package`
6. Verify the rebuilt Beta inventory and installed Workflow layout without changing the Runtime Manifest or installer mapping.
7. Ask the affected user to install the candidate and report the exact stable status code. Do not declare export fixed from the message change alone.
8. If the code identifies a further product defect, fix that shared root boundary with one focused regression and repeat the relevant package gates. Final acceptance requires Settings Ready plus one real Export to AE on the affected machine.

## Risk And Rollback Points

- Risk: mapping too broadly could disguise an internal defect as user action. Only allowlist documented, controlled codes; unknowns stay generic.
- Risk: a clearer status can be mistaken for functional recovery. Keep the user-machine export gate explicit.
- Rollback point: revert only the provider mapping/test rows if a status classification is wrong.
