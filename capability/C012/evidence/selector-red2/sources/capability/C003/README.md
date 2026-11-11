# C003 — local host / format matrix

H001/H002 · Kano S · schema **1.0.0** · local/documented-only.

Open `index.html` directly in a browser. Filtering and optional JSON inspection
operate locally, including offline. No server, dependency installation,
production framework, Azure connection, or management credential is needed.

## What the labels mean

| Label | Meaning in this component |
| --- | --- |
| Planned | Proposed work, not an implemented adapter or native availability claim. |
| Documented-supported | A documented mechanism subject to the displayed restrictions. Not permission, implementation, target discovery, or native qualification. |
| Qualified | Reserved for reviewed target-specific native evidence. **Zero rows; local-only v1 rejects this claim.** |
| Unsupported | The stated combination is not supported. The reason remains visible. |
| Unknown | A concrete capability/host selection or evidence boundary is unresolved. |

The 17 rows have separate documentation support, implementation/adapter, and
qualification fields. There are 2 planned, 9 documented-supported, 4 unsupported,
2 unknown, and **0 qualified** entries. Every native adapter is planned or not
applicable; every native configuration is unqualified with no native evidence.
Six or ten completed synthetic lessons do **not** qualify native Azure.

The matrix covers App Service code and container slots, shared compute, strict
warm-up, worker recycling/cookie limitations, Linux/container auto-swap
exclusions, automatic scaling versus slot traffic, separate-plan proposals,
Container Apps revisions, AKS routing/PDB/termination scope, Functions slot-plan
and Flex limits, and Spring Boot as a runtime rather than a routing platform.

## Contract and authority boundaries

- `matrix-contract.d.ts`: readonly interfaces and literal status/host/format,
  design, unapproved-target, and denial types.
- `matrix.schema.json`: JSON Schema 2020-12, pinned version, closed objects,
  bounded data, and local-only invariants.
- `matrix-data.js`: immutable, JSON-compatible UMD data; usable from Node or a
  classic browser script without fetching JSON.
- `matrix-contract.js`: dependency-free runtime validation and pure filtering.
  It adds cross-reference/identifier uniqueness, valid review dates, and semantic
  consistency checks to the schema's structural constraints.

```js
const contract = require('.\\capability\\C003\\matrix-contract.js');
const matrix = require('.\\capability\\C003\\matrix-data.js');
contract.validateMatrix(matrix); // { valid: true, errors: [] }
contract.filterRows(matrix, { host: 'app-service', status: 'unsupported' });
JSON.stringify(matrix); // portable local JSON input
```

Incompatible versions and unknown properties fail closed. Imported JSON cannot
grant permissions, add native evidence, select a concrete target, claim
qualification, or promote known unsupported combinations. Invalid input clears
previous results, source claims, and permission displays. Schema-consistent
imports are explicitly **not authenticated facts or approval**; text is rendered
using DOM text nodes, not HTML.

The immutable [C001 artifact](../C001/approved-contract.js) is the approval
baseline. Node.js **24 LTS / Express / App Service Linux** is a design, not an
implemented/validated production harness. Node.js **22.23.4** is test tooling.
The first planned native target is **App Service code deployment slots**;
its **OS, SKU, subscription, resource group, and region remain unapproved**.
The Linux control-API design does not select that native OS.

All Azure execution, IaC generation, scaffolding, identity registration,
deployment, and expenditure flags remain literal `false`. Live runs and
authorized spend are zero: forbidden, not free-resource approval or a quote.
There are no run/management controls. Neither the browser nor validator is a
server authorization service or a current-ledger approval probe.

## Sources and actual checks

[README](../../README.md) and [backlog](../../.docs/wiki/backlog.md) supply the
documented baseline. A dedicated researcher verified the cited Microsoft Learn
pages during this session; scope and adopted/declined assumptions are recorded
in `evidence\documentation-review.json`. This was documentation research, not
Azure availability discovery or native qualification.

```powershell
node --test --test-reporter=spec .\capability\C003\tests\contract.test.cjs .\capability\C003\tests\surface.test.cjs
node --test --test-reporter=spec .\capability\C003\tests\browser.test.cjs
```

The browser test uses the explicitly announced ready shared helper
`testing\browser\isolated.cjs`: real isolated **headless Edge**, not a mocked DOM
or integrated foreground page. It always awaits `close()` in `finally`.
Ordinary verification does not overwrite the committed observation record.
Set `$env:CAPTURE_BROWSER_EVIDENCE='1'` only for an intentional evidence refresh,
then remove that variable after the run. No extra completion credit is earned.
See `evidence.json` for genuine behavioral RED, IaC N/A before implementation,
GREEN, syntax, real keyboard/filter/invalid/unsupported checks, exact browser
versions, and the initial failed browser assertion and correction.
No browser/tool packages or global settings were installed or changed by C003.

The component's CSP denies connections, inline/evaluated scripts, images,
objects, frames, workers, and form actions. This static local surface is not
production-hosting hardening, authentication, or an accessibility certification.
Declaration/schema parity is tested; no TypeScript compiler or third-party
JSON Schema engine was installed or claimed. Runtime validation is exercised.

## Bounded follow-on work, not additional completion credit

- C005/C007 may consume this contract for the scenario catalog; this page filters
  configurations only, not the 150-scenario catalog.
- Before updating a concrete native-target row, obtain the missing OS/SKU/
  subscription/RG/region approvals. Qualification belongs to the applicable
  native adapter/proof cards, with actual target-specific evidence and separate
  execution/IaC/registration/deployment/spend approval.
- Re-review changing platform documentation and qualify the selected AKS routing
  layer/Flex envelope. A new review must not convert documentation into native
  proof or invent authoritative platform completion.
- Browser portability beyond the recorded Edge/Playwright pair, a TypeScript
  compiler pass, and full assistive-technology auditing remain unclaimed.
