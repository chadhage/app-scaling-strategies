# S055 — Cache payload evolution

**Training rehearsal - synthetic data - not a live Azure result**

A-S055 · D-S055 · frozen S · SC-S055 · `worker-A-S055`.
Open `index.html` directly in a modern browser. This is not a live cache:
no server, account, credentials, authentication, subscription or framework.
The standalone bundle declares its portable contract in `manifest.json`.

## Worked exercise

The exact source requires **versioning or translating cached objects so mixed
application versions can coexist**. D-S055 requires compatible translation or
versioning to preserve correctness and incompatible cached objects to fail explicitly.

Both synthetic readers expect `SYN-CART-055`, USD and exactly **1250 integer
minor units**. v1 consumes `totalCents`; v2 consumes `money.minor`.

1. Keep the defaults and **Prepare mixed readers**. Assumptions lock. One shared
   key receives a v1 write; both readers read it. A v2 write overwrites that key;
   both readers read it again. **Read four synthetic cache objects** yields
   **2 correct, 2 explicit SCHEMA_MISMATCH failures, gate FAIL**.
2. Predict FAIL and **Check prediction**. The learning verifier passes, but
   synthetic read impact remains INTERRUPTED. No failed read is hidden.
3. **New attempt (retain history)**. Enable **Validated lossless translation**.
   The translator validates the serialized object, maps fields in both
   directions, and preserves integer units/currency. All **4 reads pass**;
   exactly **2 translations** occur.
4. Start another attempt, choose **Versioned namespaces**, translation off.
   Each reader uses its own pre-populated `v1:` or `v2:` key twice:
   **4 correct, 0 translations, gate PASS**. This assumes both synthetic keys
   exist; it does not prove real warming, freshness or synchronization.
5. Try **Malformed** in versioned namespaces. `"1250"` is a string, not an
   integer: both v2 reads fail INVALID_PAYLOAD. No coercion or fallback repairs it.
   Try **Wrong value** with translation: the schema is valid but `1200` is not
   `1250`; VALUE_MISMATCH fails the gate. Isolation is not data correctness.
6. Try partial or absent observations. Unknown reads have no received payload,
   decoded value or inferred success. A known failure still makes the gate FAIL.
7. **Reset rehearsal and history** explicitly clears everything and returns focus
   to Prepare. Reload also clears this in-memory lesson.

| Layout / translation | Payload / coverage | Correct / failed / unknown | Gate |
| --- | --- | --- | --- |
| Shared / off | Equivalent / complete | 2 / 2 / 0 | FAIL |
| Shared / lossless | Equivalent / complete | 4 / 0 / 0 | PASS |
| Versioned / off | Equivalent / complete | 4 / 0 / 0 | PASS |
| Versioned / either | Malformed or wrong value / complete | 2 / 2 / 0 | FAIL |
| Shared / lossless | Any / partial, before v2 write | 2 / 0 / 2 | UNKNOWN |
| Shared / off | Any / partial | 1 / 1 / 2 | FAIL |
| Either / either | Any / absent | 0 / 0 / 4 | UNKNOWN |

These are synthetic read outcomes, not real uninterrupted-transition measurements.
The gate, synthetic impact, learning verifier and local-only cleanup are separate.

## Bounds, state and keyboard operation

- Four reads, two readers, two key layouts, two translation policies, three fixed
  v2 payloads and three observation choices: **36 deterministic configurations**.
  At most **six completed attempts**; no silent history eviction.
- No arbitrary JSON, scripts, keys, URLs, credentials or identities.
  Configuration must contain exactly four own enumerable data properties with
  exact string enum values. Missing/extra/inherited/symbol/accessor/coercible
  inputs fail without mutating state or invoking a getter.
- Only idle → prepared → complete is valid. Assumptions lock at preparation.
  Repeated/skipped actions and duplicate predictions fail explicitly.
  New attempt clears current proof but retains each completed configuration,
  measured result, trace and prediction. Reset can abandon prepared work.
- Private model state is not exported; deeply frozen detached snapshots protect
  nested objects, results and retained history.
- Native selects/buttons support keyboard operation. Focus follows Prepare →
  Read → Prediction → New attempt (or Reset when full). Errors use `role=alert`
  and invalid controls get `aria-invalid`. Reset restores exact defaults and
  focus. The reset button never shadows the native `form.reset` method.
- Text-node rendering, visible keyboard focus and bounded scrollable tables.
  Enforced CSP denies inline execution, connections, objects, frames, workers
  and form submissions. Only local external scripts/styles are loaded.

## Verification and provenance

Use the existing **Node.js 22.23.4** tooling only:

```powershell
node --test --test-reporter=tap .\learning\S055\tests\model.test.cjs .\learning\S055\tests\surface.test.cjs .\learning\S055\tests\integrity.test.cjs .\learning\S055\tests\browser.test.cjs
node --check .\learning\S055\fixtures.js
node --check .\learning\S055\model.js
node --check .\learning\S055\app.js
```

Normal verification is **read-only to proof**. Browser checks actually exercise
the current DOM, keyboard, state/input errors, failure/unknown paths, retained
history, reset, narrow viewport and enforced CSP. They do not update proof files.
Only deliberate capture enables writing `evidence\browser.json`:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S055\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

The only browser helper is published `testing\browser\isolated.cjs` (`53c0c0d`),
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
Tests use `openIsolatedLesson` and awaited `close()` in `finally`, with existing
offline Playwright **1.56.1** and installed Microsoft-signed Edge **156**.
No downloads, packages, unsafe flags, foreground lease, shared browser/profile
or abandoned lifecycle prototype. Its known unattended shutdown limitation
remains unqualified; this focused result is not unattended runner certification.

- Exact README S055, D-S055, A/B rows, atomic/portable contract and default
  SC-S055 packet rule were read before behavior design. Raw source snapshots
  preserve their **CRLF bytes**; source-contract metadata records both raw hashes
  and canonical Git blob/LF hashes. Line-ending normalization is explicit,
  never applied to raw snapshots.
- `cache-payload.feature` → loadable stub → genuine behavioral RED:
  **21 tests, 1 pass, 20 assertion failures**, exit 1, no missing code/tools.
  Original feature, fixtures, stub and tests remain non-auto-discovered
  `.snapshot` files with binary Git attributes.
- `evidence\iac-decision.json` records **IaC N/A after RED, before implementation**.
- Gzip-preserved raw stdout/stderr and their SHA-256 metadata retain provenance.
  Readable TAP removes trailing whitespace only. Focused green, syntax, real
  browser capture and canonical content hashes bind verification to this bundle.
  The finite inventory excludes itself and final run logs to avoid self-reference.
- A post-implementation integrity check exposed Git clean-filter differences
  for root-relative Windows operands. The failed check, original test/inventory,
  raw diagnostics and path probes are retained separately, not called behavioral
  RED. Qualification now uses the actual Windows directory and basename; binary
  snapshots stay byte-exact. Both original and corrected syntax records remain.
- Intentional source changes require deliberate recapture/content-hash refresh.
  Ordinary tests never silently repair evidence.

## Evidence boundary and remaining work

This portable model proves no real cache/service, native Azure behavior, expiry,
warming, invalidation, races, synchronization, authentication, real user
transition or five-nines reliability. Node22 is tooling, **not production Node.js 24**
certification. Native B-S055 and original D-S055 acceptance remain **unfulfilled**.
Their CORE/DATA/HOST gates and real cross-version cache proof remain required;
they are not extra To Do units owned by this lesson.

Only `learning\S055\**` is owned. No cloud/IaC/scaffold/identity/deploy/spend,
package/framework, root/shared or unrelated edits. One frozen S unit only:
tests, evidence, tooling and refinement earn no additional credit.
Scoped tagged publication is not self-acceptance; the parent alone accepts once.
