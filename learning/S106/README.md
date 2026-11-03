# S106 - Public probes versus the private dependency path

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No server or account is needed.
Every network, DNS, client-placement, identity/access, probe, dependency and
management observation is fixed fictional **DATA ONLY**, never a real
network/system/resource/identity operation. No real probe is executed.

## Worked exercise

1. Choose **Private client gets a public DNS answer**, then record public only.
   Public HTTP 200 / 24 synthetic ms succeeds, but the actual private path and
   its duration are **unknown**, not eligible.
2. Record public and internal health only. Internal HTTP 200 / 18 synthetic ms
   also succeeds; neither health observation certifies private connectivity.
3. Compare the private teaching trace. The application-client label is correct,
   but `public-address-label` differs from required `private-address-label`.
   The private result is **failure**, despite public/internal success.
4. Compare **Complete private-path teaching trace**. Required application-client
   placement, DNS, connectivity, authorization, dependency completion in 84
   synthetic ms (150 ms budget), and unexposed management yield **synthetic success**.
5. Try the unrelated successful client. Its placement fails applicability, but
   the **actual private path remains unknown**, not diagnosed as failed or working.
6. Reset by mouse or keyboard. Defaults, empty current output and focus reset;
   every prior record and the twelve-record allowance remain. Reload starts a
   fresh in-memory page session.

Other fixed conditions cover connection/access denial, wrong dependency, missing
private/DNS observations, exposed management, and a slow private HTTP 200.
Unobserved access/completion stays unknown after a known connection failure;
missing durations stay `null`, never zero. Public/internal successes are counted
separately from private success/failure/unknown. Earlier failures remain counted
after later success and reset.

Native controls support Tab, arrow keys and Enter. Invalid selections and the
session bound focus an announced error without changing history. The pure model
rejects non-exact typed input/state, accessors, extra fields, forged historical
results and invalid array shapes. Its data and results are immutable.

## Exact source and boundaries

- `S106` in repository `README.md`: **Private endpoint/private DNS:** test the real
  application access path, not only an externally reachable probe.
- `D-S106` in `.docs\wiki\backlog.md`: required private connectivity is verified
  without exposing management access; public-probe success alone cannot approve
  the path. Original dependency: `P006`.
- `A-S106`: compare public and private probes; public success cannot certify a
  private dependency path. `SOURCE` gate, packet `SC-S106`, one original frozen S unit.
- The exact source rows, portable/atomic contract, claim, original unit and packet
  rule were read before behavior design. Working-tree raw CRLF excerpts and pinned
  canonical Git blobs are separately qualified in `evidence\source-contract.json`.
- `B-S106`, actual private endpoints/DNS/client placement, live authorization and
  the source parent remain **unqualified**. A synthetic pass is not native proof.
- IaC is explicitly **N/A**, recorded after genuine assertion RED and before
  implementation. No cloud, scaffold, identity registration, credentials, deployment,
  spend, packages, frameworks, shared files or source-parent edits.

## Focused verification (repository-root PowerShell)

```powershell
node --test .\learning\S106\tests\model.test.cjs .\learning\S106\tests\bundle.test.cjs .\learning\S106\tests\evidence.test.cjs
node --test .\learning\S106\tests\browser.test.cjs
node --check .\learning\S106\model.js
node --check .\learning\S106\app.js
node --check .\learning\S106\scripts\capture.cjs
```

Normal verification is **read-only**, including all retained evidence. The browser
test checks the complete owned file-byte snapshot before and after verification.
The actual RED runner output, original loadable wrong-behavior stub, assertion and
BDD are byte-preserved `.snapshot` files under `evidence\raw`, outside automatic
test discovery. Do not regenerate or replace them.

Browser checks use only the published `testing\browser\isolated.cjs` (`53c0c0d`,
raw SHA256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`),
`openIsolatedLesson`, and an awaited `finally` close. Existing offline Playwright
1.56.1 / Microsoft-signed Edge 156 / Node 22 is **test tooling only**, not production
Node 24, native Azure, source-parent or universal browser qualification. The lifecycle
prototype remains unqualified; no foreground lease, unsafe flag, install or download.

Deliberate producer browser capture only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S106\scripts\capture.cjs browser
Remove-Item Env:CAPTURE_BROWSER_EVIDENCE
```

`scripts\capture.cjs` runs only an explicitly selected producer stage. Captured
browser evidence includes actual DOM, positive/negative/unknown states, keyboard,
focused errors, reset, bounded history, CSP observations and awaited cleanup.
CSP eval/inline checks execute in a local page-owned **test-only** script; DevTools
evaluation itself is not the enforcement oracle. They do not run network probes.
The initial legacy Windows PowerShell signature check failed to load its security
module; an actual reproduced failed child invocation is preserved in
`evidence\tooling-attempt.json` and its raw output. Existing PowerShell 7 verified
the Microsoft signature without installation; the failed attempt earns no credit.
The first browser capture caught a blocked theme: CSP hashes must use HTML-parsed
LF script text, not raw file CRLF. Its failed runner output and prior acceptance
record are retained; the corrected parsed-text hash is observed in the real browser.
Another retained browser attempt caught an overstrict console-count assertion:
Edge emitted one inline-block console message, while the caught `EvalError` and
both enforced violation events directly proved eval/inline blocking. Assertions
use those actual enforcement observations, not an invented second log message.
Explicit lesson-only byte attributes also pin the published raw source/proof bytes;
original-source canonical Git qualification remains a separate check.
Raw evidence is non-diffable, and the scoped source whitespace rule recognizes
CRLF without weakening whitespace checks or changing shared Git configuration.

The worker reports actual verification and scoped publication; the parent alone
accepts once. Tests, repairs, provenance and refinement earn **zero extra credits**.
