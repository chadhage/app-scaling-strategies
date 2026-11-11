# C004 — local run-consent plan view

Open `capability\C004\index.html` directly in a browser. No server, package installation, Azure credentials, network access or production framework is needed.

1. Supply **both** JSON records, or explicitly load a labelled local or blocked-native example.
2. Use Tab and Enter on **Review plan — no execution**.
3. Inspect the cost, duration, resource, load and capacity assumptions, exact supplied bounds, configuration constraints, pinned provenance and blocking reasons.
4. Only a valid **resource-free local plan with not-applicable cloud pricing** enables the unchecked local acknowledgement. Space, Tab, Enter records it in memory.
5. Editing **either** input, loading an example, rereviewing, resetting or refreshing removes any previous acknowledgement. Reset returns focus to the first input. Nothing is stored or uploaded.

## What this delivers

One frozen **S** card, `kanoUnit=C004`, parents **H001/H003**, technical gates **C002/C003**. The exact acceptance is the [C004 row](../../.docs/wiki/kanban.md) and its source parents in [backlog.md](../../.docs/wiki/backlog.md). This is a local plan/consent **data UI**, not a new executor, production API, native adapter, role boundary, lease, reservation or server consent/audit service. It does not complete either parent.

`buildPlan(request, explicitApproval)` and `createReviewSession()` are local JavaScript component functions; `plan-model.d.ts` describes their shapes. The runtime rejects unknown/missing fields, non-data properties, invalid numeric values and inconsistent price/scope records. No TypeScript compiler or JSON Schema engine was installed or claimed.

### Actual dependencies, unchanged

| Accepted card | Used directly | Pinned publication |
| --- | --- | --- |
| C001 | `approved-contract.js`, `contract-guard.js`: approval integrity and operation decisions | `cfff04364ade947aa398004b21548a15272021e7` |
| C002 | `validateRunEnvelope`, its schema, `parseJsonInput`, and its explicit synthetic fixture | `5feaab2929a615aa7f6968fd39355868dd321e4f` |
| C003 | `validateMatrix`, `filterRows`, immutable matrix rows, constraints and documentation sources | `1583da90c1013ba95fdf268d6901f8a14bdf900a` |

No guard, run-envelope validator, capability matrix or catalog metadata is reimplemented. `plan-provenance.js` records accepted commits/tags, the C001 operator snapshot source, structured-data SHA-256 pins, Git blob hashes and the observed Windows CRLF hashes. Focused integrity tests verify the unchanged source against the exact published Git objects, allowing only the two pinned LF/CRLF representations. Runtime data drift or missing SHA-256 denies review. C001 itself remains the sole approval-integrity implementation.

The browser verifies the **bundled snapshot**, not the current repository ledger or authoritative server consent. An in-memory fingerprint is a stale-review safeguard, **not** a signed authorization token.

## Explicit input and result semantics

The first textarea supplies all plan fields except `envelopeRequest`; the second supplies that unchanged C002 request. An embedded `envelopeRequest` is an explicit error, never silently overwritten. No input is initially populated. C002's duplicate-field and precision-loss parser is reused for both.

| Required plan field | Meaning |
| --- | --- |
| `schemaVersion` | Exactly `1` |
| `mode` | `local-resource-free` or `native-proposal`; neither executes anything |
| `configurationId` | Explicit `null` locally; an actual pinned C003 row ID for a native proposal |
| `durationBasis` | Nonblank explanation of the comparison duration's scope and gaps |
| `resources` | Closed `{cloudResourceCount, description}` record; local count exactly `0`; native positive assumption or explicit `null` for unknown |
| `pricing` | Closed `{status, currency, totalMinorUnits, basis, source}` record |
| `envelopeRequest` | Required `{envelope, limits}` with every C002 min/max; no fallback limits |

C002's explicit fixture remains **synthetic comparison data**, never operating defaults. Comparison duration, load and capacity are displayed with their actual supplied bounds. Synthetic capacity units do not select an Azure SKU or resource count. Native elapsed setup, run, overlap, cleanup and billing duration remain **unknown**, regardless of the comparison seconds. Resource assumptions are not verified inventory; nothing is reserved.

### Cost is not authority

- **not-applicable:** Resource-free local review only. Amount, currency and source must all be `null`. The UI says **no cloud execution**, not “Azure is free.” Local machine/electricity costs are outside the estimate.
- **missing / unknown:** Amount, currency and source must all be `null`, never `0`. A readable plan is **blocked**, even if its other inputs are valid and even in local mode.
- **unverified-estimate:** Native proposal only, with a positive safe-integer declared total in currency minor units, explicit currency, basis and `{reference, capturedAtUtc, configurationId}` source. Source must name the same configuration. It is not fetched, checked, freshness-qualified, converted or accepted. Precision, taxes, discounts, coverage and billing duration remain unverified. It **still blocks consent**.
- Native **not-applicable**, native resource count `0`, unknown targets, fabricated free amounts and inconsistent sources are explicit validation errors.

`valid=true` means the data can be displayed. It does **not** mean approved: `outcome=blocked-plan` has visible reasons and `canAcknowledge=false`. Native plans retain C001's original denial codes and C003's exact status/reason/constraints. Documented support never becomes native qualification or consent. Invalid results expose no plan; prior results are cleared, not used as fallback.

The session records only `scope=local-plan-review-only`, an input fingerprint, revision, browser-clock timestamp, and `cloudExecutionAuthorized=false`. Every input edit invalidates it, including an edit back to old text. A review finishing after an edit is discarded. Future execution must separately enforce current authoritative consent, authentication, server ownership, leases and budgets.

## Fixed authorization boundary

All six live/native, IaC, scaffold, deployment, identity-registration and expenditure approvals remain **false**. `liveAzureRuns=0`; authorized cloud spend `0` means spending is forbidden, **not a price**. No OS, SKU, subscription, resource group or region is inferred. No Azure login, pricing/resource query, identity registration, cloud execution, deployment, IaC generation, spending, executor or production API was added.

Node.js **22.23.4** is test tooling. The approved Node.js **24 LTS / Express / App Service Linux** design remains **unvalidated for production**.

## Verification and evidence

```powershell
node --test --test-reporter=spec capability\C004\tests\plan.test.cjs capability\C004\tests\integrity.test.cjs capability\C004\tests\browser.test.cjs
```

BDD was written first. Three **actual behavioral RED** failures against a loadable stub, its exact stub/test snapshots, then the **IaC N/A** record preceded implementation. Intentionally RED snapshots are `.txt`, not auto-discovered test filenames. Exact original RED/source/intermediate-failure bytes are also retained in `.gz` archives with roundtrip SHA-256 checks in `evidence\raw-artifacts.json`. Readable failing logs remove only trailing spaces/tabs to satisfy the unchanged publication guard; no original raw bytes are discarded. `evidence.json` identifies artifacts and actual verification counts.

Final focused verification: **107/107 passed** — 95 local unit/integrity checks, 11 actual browser acceptance subchecks and their parent test. All seven owned JavaScript/test files pass `node --check`.

The actual browser tests use only the verified `testing\browser\isolated.cjs` **openIsolatedLesson(relativeRepoPath)** and await `close()` in `finally`. Explicit offline **Playwright 1.56.1**, valid Microsoft-signed **Edge 156.0.4314.50**, headless isolation, normal TLS and browser sandbox; no install, download, integrated foreground lease or weakened settings. The helper's imported worktree hash is recorded because the shared helper may evolve independently.

Browser evidence covers real DOM, Tab/Space/Enter, unchecked consent, both inputs' invalidation, native/unpriced/unsupported/unknown states, inert HTML-looking source text, explicit alerts/focus, reset/refresh, 390px reflow, disclosure keyboard, denied flags, provenance, no remote traffic/page errors and awaited cleanup. One explicitly labelled error subcheck supplies omitted/changed local-script bytes to test missing dependencies, matrix drift and unavailable integrity in the real browser; it changes no files or authority. This is **not** a full WCAG certification, native proof or server-security test.

An intermediate focused run is retained honestly: eight test assumptions equated LF Git blobs with CRLF checkout bytes, and one unknown-target test accidentally supplied a mismatched price-source target. Exact dual source pins and the fixture were corrected; no dependency implementation was edited.

## Remaining source scope

`refinement.json` preserves H001/H003 lineage and concrete C009/C010/C011/C012 gates without adding cards or extra Kano credit. Local acknowledgement is not their enforcement. Native plans remain blocked; production/current-price/lease-budget work requires separate approval and implemented prerequisites.

Only `capability\C004\**` is owned and published. Publication is not acceptance: C004 remains In Progress until independent parent review.
