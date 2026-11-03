# C002: explicit local run-envelope validation

Open `capability\C002\index.html` directly in a browser. No server, packages, credentials, or network access are required. The C001 approval and exact JSON Schema remain visible.

1. Supply **both** JSON inputs, or explicitly choose **Load synthetic local fixture**.
2. Use Tab to move through the textareas to **Validate locally — no execution**; press Enter.
3. Read the live status, precise field-path/code/reason table, and read-only result.
4. **Reset inputs and result** clears both inputs and stale decisions and returns focus to Envelope JSON. Editing either input also invalidates the previous result. No input is stored.

## Contract and authority

`validator.d.ts` is the typed API. `run-envelope-contract.js` exports the recursively frozen JSON Schema and numeric/range policies. The validator consumes that schema; all objects are closed and all listed fields are required. Every number must be a finite safe integer, not a coerced/boxed value, fraction, BigInt, or negative zero. The schema is supplemented by JSON-data-property, ordered-bound, supplied-range, and C001 authority checks.

`json-input.js` rejects duplicate JSON fields and precision-losing numeric literals **before** a parsed value reaches validation. Exact safe integers such as `1.0` and `1e2` remain valid numeric values; a literal like `1.00000000000000001` cannot silently round to `1`. A local parser safety ceiling of 16 nesting levels is explicit; it is not a workload or Azure limit.

```javascript
const { validateRunEnvelope } = require('./validator.js');
const result = await validateRunEnvelope(
  { envelope: explicitlySuppliedEnvelope, limits: explicitlySuppliedLimits },
  explicitlySuppliedC001Approval
);
// result.valid is a comparison outcome; result.executed is always false.
```

| Metric | Explicit comparison rule |
| --- | --- |
| `load.requestsPerSecond` | Inclusive supplied positive-integer min/max |
| `load.concurrentUsers` | Inclusive supplied positive-integer min/max |
| `durationSeconds` | Inclusive supplied positive-integer min/max, seconds |
| `capacity.units` | Inclusive supplied positive-integer min/max, synthetic units only |
| `budget.cloudSpend` | Explicit supplied interval `[0, 0]`; expenditure forbidden |

These are local input rules, **not production or provider limits**. There are no fallback limits. The labelled `synthetic-fixture.js` values (load 1–100 / users 1–20 / seconds 1–300 / capacity 1–4 / spend 0–0) are intentionally synthetic examples, loaded only by an explicit operator gesture. Capacity units do not select a SKU or provision capacity. Bounds cannot grant authority.

C002 imports **C001's `approved-contract.js` and `contract-guard.js` unchanged**. C001 alone pins consent integrity and decides operation authority. The caller must explicitly supply approval; this module has no approval default or visitor override. The browser uses the pinned **bundled snapshot**, not the current repository ledger. See `..\C001\README.md` and C001's current-ledger probe for that separate limitation. A changed approval deliberately denies until reviewed C001 authority is updated.

Only an explicit `local.probe`, mode `local-implementation-only`, zero `liveAzureRuns`, zero `cloudSpend`, complete limits, and unchanged C001 approval can produce `valid-local-envelope`. Restricted actions receive C001's original denial codes. Unknown target/tenant/region/SKU/approval/operation-flag fields are rejected. No input is executed and no management request is made.

`authority.allowed` concerns only C001's side-effect-free local probe. The top-level `valid` describes the complete envelope comparison. Neither field authorizes execution.

## Fail-closed results

Each rejection includes `{ path, code, message }`. Range errors include the supplied inclusive interval. Missing JSON, malformed JSON, unknown fields, missing limits, unsafe numeric values, malformed records/accessors, invalid ranges, scope escalation, and unavailable authority are explicit failures. Rejected results expose neither a validated envelope nor applied limits. Successful results are immutable copies, not retained caller references.

The static surface has no inline scripts, form navigation, network connections, workers, external assets, storage, or HTML interpolation. Its CSP denies connections and form actions. Missing dependencies leave validation disabled. Node source/factory tests are **unit checks, not browser proof**; actual integrated-browser observations are recorded separately.

## Verification and boundaries

```powershell
node --test capability\C002\tests\*.test.cjs
node --check capability\C002\validator.js
node --check capability\C002\run-envelope-page.js
```

BDD is in `C002.feature`; actual loadable-stub RED, focused GREEN/syntax, and real keyboard/invalid/reset browser evidence are in `evidence.json` and `evidence\`.

Run real browser verification with `node --test capability\C002\tests\browser.acceptance.cjs`. Ordinary verification leaves committed observations and screenshots unchanged. Set `$env:CAPTURE_BROWSER_EVIDENCE='1'` only when deliberately refreshing those outputs, then remove that environment variable after the run. Capture does not authorize execution or earn another completion credit.

- `liveAzureRuns=0`, `cloudSpend=0`. All live Azure, IaC, scaffold, deployment, identity-registration, and expenditure approval flags remain **false** under C001.
- This is local comparison, not server-enforced authentication, authorization, roles, leases, budgets, or load generation. Future execution must independently enforce current authoritative consent and all server-side boundaries.
- Node.js **22.23.4** is test tooling only. Node.js **24 LTS / Express / App Service Linux** remains the design, not runtime/native qualification.
- No production limits, tenant, native OS, SKU, subscription, resource group, or region is inferred. No Azure operations or expenditure occurred.
- **IaC: N/A** for this local unit; none is generated. Cloud/production enforcement and qualification require separate approved work, not a bonus or additional Kano unit.
