# S071 · Shared-cache expansion

**Training rehearsal - synthetic data - not a live Azure result**

Open [index.html](index.html) directly in a modern browser. No server, subscription, cache, account, credentials, framework or install is needed.

## Exact source and scope

- README S071: **Shared-cache expansion:** Scale cache capacity while keeping application access and payload compatibility intact.
- D-S071: Add cache-capacity changes under mixed-version read/write traffic. Acceptance: actual cache behavior, payload compatibility, and journey budgets remain valid; native resize limitations are disclosed.
- A-S071, frozen **S**, packet **SC-S071**, gate **SOURCE**: Resize cache with mixed readers; detect payload incompatibility masked by extra capacity.
- Owned namespace: `learning\S071\**`; owner `worker-A-S071`. One unit only; tests, plumbing and refinement earn no additional credit.

The exact source rows, portable/atomic contract and packet rule were read and captured **before behavior design** in [source-contract.json](evidence/source-contract.json). Raw working-tree CRLF snapshots and immutable canonical Git blobs are retained independently. The primary lesson is a **capacity comparison under the same mixed traffic**, not a replacement for S055 payload evolution, S072 stampede, S073 recovery or S074 eviction.

## Work the exercise

1. Declare target capacity, payload overlap, resize condition, observation coverage and original journey budget.
2. **Resize synthetic cache** freezes those settings. This is a modeled operation, not a management call.
3. **Probe mixed read/write traffic** performs a fixed sequence before, during and after resize: v1 write, v1/v2 reads, v2 write, v1/v2 reads. Inspect every observed row, not just the capacity headline.
4. Choose **PASS**, **FAIL** or **UNKNOWN** and check your interpretation. A correct answer does not turn failed journeys into success.
5. **New attempt** restores defaults and clears the active view while retaining immutable history. At six results, explicitly **Reset rehearsal and history** before continuing.

Tab, arrow keys, Enter and Space operate the standard controls. Errors are announced and focused without advancing state. Reset clears configuration, pending resize, results, errors, invalid markers, prediction and history and focuses the resize button. Neither form shadows the native `form.reset()` method.

## Synthetic fixture and assertions

One in-memory shared key carries **Synthetic Ada / cart 3**. Each phase performs two writes and four reads; 18 observations are required. The JS model really serializes and decodes these **synthetic** payloads:

- v1 writes schema 1; both readers can decode it.
- Breaking v2 writes schema 2; v2 can decode it, v1 cannot.
- Compatible overlap keeps both writers on schema 1.

Baseline capacity is 4 units against demand 8. Targets are 8 or 12. Modeled latency is `20 + max(0, 8 - capacity) * 15` ms: **80 ms before**, **20 ms after** a supported fixture resize. These are deterministic teaching values, not elapsed network/cache measurements. Budgets are strict integers 20–120 ms in steps of 10; the original budget applies to every phase.

| Operator condition | Observable result |
| --- | --- |
| Breaking payload, target 12, 100 ms, complete continuous observations | **FAIL**: latency improves 80 → 20 ms, but three old-reader payload failures remain, one per phase. |
| Common schema 1, continuous access, complete observations, 100 ms | **PASS**: all 18 modeled operations retain access, required profile and budget. |
| Compatible payload, resize access gap | **FAIL**: six interrupted accesses remain counted after recovery. |
| Compatible payload, 30 ms original budget | **FAIL**: six earlier 80 ms operations fail even though later operations take 20 ms. |
| Only v2 observed with breaking payload | **UNKNOWN**: nine old-client operations are missing; observed zero errors is not mixed-client proof. |
| No observations | **UNKNOWN**, not empty-sample success. |
| Compatible payload, unsupported resize | **FAIL**: operation rejected, target not applied; only six baseline operations observed. |
| Compatible payload, unverified capability | **UNKNOWN**: no target capacity or later-phase evidence is fabricated. |

Known failures outrank uncertainty. For example, an unverified resize with an observed baseline payload failure remains **FAIL**. Per-row reasons can overlap, but failed operations are counted once. Missing observations never count as passes.

The finite envelope has 528 configurations, at most 18 observed operations per attempt, and six retained attempts. Configuration shape, enum types, numeric bounds, state provenance, action order and immutable history are guarded. No arbitrary endpoints, payloads, timers, real users or background load are accepted.

## BDD → RED → IaC N/A → green → browser

[cache-resize.feature](cache-resize.feature) preceded the loadable stub. The unchanged nine acceptance cases initially produced **seven actual `ERR_ASSERTION` failures**, with two passing cases—not missing code, packages or tooling. Original stub, fixture, BDD and tests have non-auto-discovered `.snapshot` names beside byte-exact [raw RED](evidence/red/run.json). [IaC N/A](evidence/iac-decision.json) was recorded after RED and before implementation.

From the repository root, normal verification is **read-only**:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE=$null
node --test --test-reporter=spec --test-concurrency=1 .\learning\S071\tests\acceptance.test.cjs .\learning\S071\tests\model.test.cjs .\learning\S071\tests\surface.test.cjs .\learning\S071\tests\integrity.test.cjs .\learning\S071\tests\browser.test.cjs
```

Tests check all 528 configurations, strict guards, payload decoding, retained failures/history, source/RED provenance, syntax and raw/canonical Git integrity. The actual isolated browser checks operator actions, invalid budget/tampered input, wrong/correct interpretation, success/failure/unknown, keyboard/focus, all reset phases, history bound, narrow viewport and CSP.

Historical capture is deliberately separate: `tests\capture.cjs` accepts only `source`, `red`, `focused-green` or `browser-green`; `tests\seal.cjs` accepts only `syntax` or `index`. They create evidence with exclusive writes and refuse overwrite. **Do not rerun capture/seal as ordinary verification.** `CAPTURE_BROWSER_EVIDENCE=1` is used only for deliberate browser capture; reruns without it preserve all retained proof.

Browser tooling is the already available **Node 22.23.4 / offline Playwright 1.56.1 / Microsoft-signed Edge 156.0.4314.50**. Only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`) is used, with `openIsolatedLesson` and awaited `finally` close. No integrated-browser foreground lease, download, install, TLS/sandbox weakening or abandoned lifecycle prototype is used.

CSP is observed enforcing dynamic evaluation, inline/external scripts, inline styles, connections, base URI and form actions. File-origin Worker creation is rejected **before** a worker-src CSP event; worker-src is declared, but its separate enforcement is **not qualified**. Test-driver probes are not app network behavior. The exercise issues no network requests and no CSP probe receives a remote response.

## Evidence and remaining acceptance

[manifest.json](manifest.json) is the discoverable lesson contract. [evidence.json](evidence.json) links raw runs, browser observations, syntax, tooling and the content index. Narrow owned `.gitattributes` preserves raw evidence without CRLF normalization; read-only integrity checks qualify clean-filter identities before publication and actual owned HEAD blobs afterwards.

This is a deterministic interleaving, not real concurrency, cache sizing advice, an eviction/refill/recovery lesson, a benchmark or native payload interoperability certification. A real cache operation has service-, SKU-, topology- and region-specific support, timing, connection and downtime limits that must be checked on the actual approved target.

**B-S071 and D-S071 remain incomplete.** Actual cache access/resize, mixed-client payload interoperability and user journey budgets still need approved native CORE/DATA/HOST fixtures and evidence. Production Node 24, native Azure behavior, source-parent completion, five-nines reliability and unattended browser lifecycle certification are not established. The helper has known lifecycle limits; a successful bounded run does not qualify its abandoned recovery prototype.

Publication uses the authorized scoped publisher, `[A-S071][S]` evidence label, Copilot coauthor, annotated `kanban/A-S071/<12sha>`, atomic main/tag push and remote check. Only the parent may empirically Accept this one unit; worker verification is not acceptance.
