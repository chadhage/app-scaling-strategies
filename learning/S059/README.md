# S059 — Configuration-version overlap

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, account, installation or network is needed. A-S059 owns only this directory, is one frozen Kano **S** unit in **SC-S059**, and awaits parent-owned acceptance after publication.

## Exact source and acceptance

- `README.md`, S059: **Configuration-version overlap:** Ensure old and new code interpret shared flags and configuration consistently.
- `.docs\wiki\backlog.md`, D-S059: Add configuration-schema/flag version changes across mixed deployments. **Both versions interpret approved shared configuration consistently; incompatible publication is gated.** Parent dependency: D-S010.
- `.docs\wiki\kanban.md`, A-S059: Interpret flags/configuration with old/new code; detect divergent meanings of one shared setting. Entry gate: SOURCE.
- The portable A/card contract requires a worked browser exercise, declared fixture/actions/assertions/limits, synthetic banner and keyboard controls. Its atomic contract requires BDD → genuine assertion RED → IaC or N/A → implementation → focused green and actual browser checks → scoped publication → parent acceptance.
- Default packet membership is SC-S059; B-S059 and the source parent remain incomplete. D-S010's compatible-code-before-activation requirement is represented as a precondition, not claimed implemented by this lesson.

Exact raw source excerpts, baseline commit, hashes, packet/parent rules and the non-discovered stub/test/BDD snapshots are in `evidence\source-contract.json`. Source acceptance is verified against the actual rows, not inferred from the title.

## Worked exercise

One shared numeric setting, **retryBudget**, is interpreted independently by old-v1 and new-v2.

| Choice | Old-v1 | New-v2 |
| --- | --- | --- |
| retries-v1; compatible new code | value = extra retries; total = value + 1 | same approved legacy meaning |
| retries-v1; divergent new code | total = value + 1 | value is silently reused as total attempts |
| attempts-v2 | explicitly unsupported | total = value |
| missing new-reader observation | observed under its supported schema | unknown; no invented success |

The deterministic synthetic dependency succeeds on attempt **3**. Each inspection runs exactly two logical probes, not actual network retries. retries-v1 permits raw integers **0–4**; attempts-v2 permits **1–4**. At most five attempts are modeled per probe. Publication requires semantic agreement, both completed journeys and a check for the exact current draft.

1. Inspect default retries-v1 value 2 with compatible code, then publish: total attempts 3/3, successes 2, failures 0, unknowns 0.
2. Select divergent code, inspect and try publication: attempts 3/2, successes 1, failures 1. Publication is blocked and the prior configuration stays published.
3. Use divergent value 3: both probes succeed, but meanings 4/3 still fail compatibility. Healthy probes cannot excuse a shared-setting contract change.
4. Choose a missing observation: value 2 gives one success and one unknown, not two successes. attempts-v2 explicitly fails the old reader.
5. Compatible value 1 agrees semantically but both journeys exhaust two attempts. Compatibility alone is insufficient.
6. Restore compatible retries-v1 value 2, inspect and publish. Earlier failures and blocked/unknown records remain.

Changing any input invalidates its check. Invalid inputs/actions/states and forged checks are rejected without measured-state mutation. History retains **16** inspection/publication records and then refuses further measured actions; it never silently drops a failure. Explicit **Reset lesson** clears local history/publication, restores defaults and focuses the schema selector. Native labeled controls support Tab, arrows, Enter and Space. Refresh starts a new in-memory rehearsal.

## Verification

From the repository root in PowerShell, with the existing Node.js 22 tooling:

```powershell
node --test .\learning\S059\tests\model.test.cjs .\learning\S059\tests\surface.test.cjs .\learning\S059\tests\integrity.test.cjs
node --test .\learning\S059\tests\browser.test.cjs
node --check .\learning\S059\model.js
node --check .\learning\S059\lesson.js
```

**Normal verification is read-only** to saved proof. Browser checks use only published `testing\browser\isolated.cjs` (`53c0c0d`, raw SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `close()` in `finally`. Its abandoned lifecycle prototype is unqualified; this focused run is not unattended-runner certification.

Proof was captured deliberately with `CAPTURE_BROWSER_EVIDENCE=1` (PowerShell: `$env:CAPTURE_BROWSER_EVIDENCE='1'`) and `node .\learning\S059\tests\capture.cjs browser`. Capture refuses to overwrite an existing raw run. Do not set that variable during ordinary verification. Raw stdout/stderr and command/runtime provenance live in `evidence\raw\`; RED sources use `.snapshot`, never an auto-discovered test extension. Narrow owned `-text -diff` attributes preserve exact raw snapshots, including source CRLF, without treating their byte-preserved line endings as source whitespace. Integrity uses canonical LF hashes for ordinary Git-normalized source.

BDD was written first. The loadable stub's real assertion RED was `'UNKNOWN' !== 'PASS'`, not a missing module/tool. `evidence\iac-stage.json` records **IaC N/A after RED and before implementation**: this lesson creates no resources. Green and actual DOM/keyboard/error/reset/failure/CSP checks are separate evidence.

| Preserved evidence | Observed scope |
| --- | --- |
| `evidence\raw\red\` and `evidence\red\` | One actual failing assertion, loadable stub and unchanged BDD/test snapshots |
| `evidence\raw\green-002\` | Final 18 passing model/surface tests; the earlier green remains preserved |
| `evidence\raw\browser\` and `browser-session.json` | 12 passing DOM/keyboard/error/reset/failure/CSP checkpoints (13 Node test records including the wrapper), actual observations and awaited session closure |
| `evidence\raw\edge-signature.json` | Valid Microsoft signature on installed Edge 156.0.4314.50; no download |
| `evidence\integrity-003.json` | Final canonical lesson-source and exact raw-evidence hashes; verification also checks Git clean-filter behavior |

The first integrity qualification found a test-path mistake: Git's `hash-object --path` requires Git attribute-path separators, not Windows filesystem separators. Its failed 6/7 run, original qualifier source and first inventory remain intact. The corrected qualifier passed 7/7 without normalizing raw bytes. Publication then refused textual CRLF evidence as trailing whitespace before any commit; `publication-check-001` preserves the actual read-only guard reproduction and original attributes. Adding `-diff` only to those exact raw-evidence patterns resolves that publication issue without changing proof bytes, ordinary source checks, or Kano scope.

## Boundaries and incomplete remainder

Synthetic data only. No management calls, credentials, authentication/registration, cloud, IaC, scaffold, package/framework/root/shared edits, downloads, deployment or expenditure. CSP blocks connections, inline execution, forms, frames, workers, images and objects; UI rendering uses text nodes.

No live Azure result, real distributed-configuration/propagation proof, native B-S059, production Node.js 24 validation, completed D-S059/D-S010 or reliability certification is established. Only the recorded local Node.js 22 / offline Playwright 1.56.1 / installed Microsoft-signed Edge 156 pair is exercised. Native publication across actual mixed deployments remains a separate blocked B scope requiring the approved CORE/DATA/HOST prerequisites; no additional test/plumbing unit is created here.
