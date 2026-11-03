# S104 - Internal warm-up versus external paths

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. This standalone exercise compares
a successful internal warm-up with fixed external host, redirect, callback,
authentication and routing observations. These are **DATA ONLY**, not requests,
identity operations, real callbacks or configuration changes.

## Worked exercise

1. Choose **External callback loses state**, keep **Record internal warm-up only**,
   and record. Internal HTTP 200 / 32 synthetic ms is successful, but the external
   result is **unknown / not eligible**.
2. Choose **Compare with the external teaching trace** and record. Internal health
   still succeeds, but expected `lesson-state-A` differs from `lesson-state-B`;
   the external result is **failure / not eligible**, even with HTTP 200.
3. Compare **Approved external path**. The matching public host label, one approved
   non-looping hop, retained callback state, authentication, expected destination
   and 180 ms synthetic journey within the 250 ms budget yield **synthetic success**.
4. Compare the missing-external or missing-callback condition: missing measurements
   are **unknown**, never zero or successful. Earlier failures remain counted.
5. Reset by mouse or keyboard. Defaults, current output and focus reset; page-session
   history and the twelve-record allowance remain. Reloading starts a new session.

Other fixed negative conditions cover host-header mismatch, redirect loop,
authentication failure and wrong effective route. Native controls support Tab,
arrow keys and Enter. Invalid selections focus the error without adding a record.
The model rejects non-exact input/state schemas and forged historical results.

## Source and boundaries

- `S104`: prevent warm-up success from hiding production redirect/callback failures.
- `D-S104`: external production-path failures are detected despite internal health
  success; approved redirects do not loop or lose state. Original dependency: `P006`.
- `A-S104`: compare internal warm-up and external redirects/callbacks; detect misleading
  internal success. `SOURCE` gate; packet `SC-S104`; one original frozen S unit.
- The portable contract, exact rows, claim and packet rule were read before behavior
  design. Raw CRLF excerpts and independently pinned canonical Git blobs are retained.
- `B-S104`, real external hosts/authentication and the original source parent remain
  unqualified. No cloud, IaC, credentials, app registration, framework or packages.
  IaC is explicitly **N/A** after the actual assertion RED and before implementation.

## Focused verification (repository-root PowerShell)

```powershell
node --test .\learning\S104\tests\model.test.cjs .\learning\S104\tests\bundle.test.cjs
node --test .\learning\S104\tests\browser.test.cjs
node --check .\learning\S104\model.js
node --check .\learning\S104\app.js
```

Normal verification does not write tracked evidence. Browser checks use only the
published `testing\browser\isolated.cjs` helper (`53c0c0d`; raw SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`),
`openIsolatedLesson`, and an awaited `finally` close. The existing offline
Playwright 1.56.1 / Microsoft-signed Edge 156 / Node 22 pair is test tooling only,
not production Node 24, native Azure or universal browser qualification. The
known lifecycle prototype remains unqualified; no foreground browser lease is used.

Producer-only browser capture is deliberate:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S104\scripts\evidence.cjs browser
Remove-Item Env:CAPTURE_BROWSER_EVIDENCE
```

`scripts\evidence.cjs` performs explicitly selected producer capture stages only.
The RED runner output and loadable wrong-behavior stub/assertion/BDD snapshots are
byte-preserved `.snapshot` files, not auto-discovered tests. Raw failed tooling or
browser attempts remain evidence of limits, not passes. Browser evidence records
real DOM, keyboard, error, reset, failure, CSP and awaited-close observations;
it does not turn teaching callbacks into real callback proof.
The CSP evaluation check uses a local page-owned **test-only** script: DevTools
evaluation is not an enforcement oracle. `evidence\attempt-limits.json` preserves
the failed first tooling/CSP attempts and the bounded, same-card recovery.

Publication/parent review awards at most one `A-S104` S unit. Tests, repairs,
provenance and refinement earn no additional credits; the worker never accepts itself.
