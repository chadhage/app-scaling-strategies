# C045 — actual isolated synthetic local clients

**Training rehearsal - synthetic data - not a live Azure result**

Original **C045 / S / P0 / H008**, gated by accepted C020 and C041. This is a new,
trusted local client component, **not** a C041 lesson, authenticated identity
service, preview entitlement, signed attestation, Azure GA destination or deployment.
It does not finish H008's no-CLI run console, native scenarios or source-parent work.
IaC is **N/A**. No packages, downloads, cloud calls, credentials, identity registrations,
framework/scaffold changes, deployment or expenditure are involved.

## Open actual clients

From the repository root:

```powershell
node .\capability\C045\clients.cjs
```

This opens **two actual separate headless Edge browsers, contexts and pages**, not
two painted panels or invented window IDs. Each call uses the unchanged published
`testing\browser\isolated.cjs` `openIsolatedLoopback(ownedAnchor, actualHttpServer)`.
Each client has its own caller-owned server bound to **literal `127.0.0.1`, port 0**.
The CLI prints both actual page/server URLs, the actual listener Node PID and observed
browser versions. The helper does not expose browser PIDs; the CLI says so instead of
inventing one. The listeners expire after 120 seconds; the opener also closes its
exact browser sessions with an awaited `finally`. Ctrl+C closes only this owned run.
No detached process, foreground lease, browser-security flag or native-launcher bypass is used.

Prerequisites are the already-approved offline **Node 22.23.4 / Playwright 1.56.1 /
Microsoft-signed Edge 156.0.4314.50** tooling. This is not production Node 24 validation.
Missing or changed tooling is an error, not permission to install or download.
Current C001 `guardOperation('local.probe')` consent and exact accepted prerequisites
are reread using ordinary installed PowerShell 7 before every listener and CLI startup.
Ledger reads hold `Local\AppScalingStrategies_KanbanState_v1`; all mutex handles are closed.
No caller approval, host, port, identity, stamp, provider or target override is accepted.

For manual interaction only:

```powershell
node .\capability\C045\server.cjs
```

Open each printed URL manually in separate browser windows. This server-only CLI
explicitly reports actual browser windows as **UNKNOWN**. Two manual windows in the
same browser profile do not prove separate browser contexts or cross-tenant isolation.
The app uses separate origins and page memory, but does not create or certify manual
browser-profile isolation. Use the actual isolated opener/acceptance runner for that
bounded evidence. There is no lesson-host popup, opener bridge or delegated identity authority.

## Controls and observations

Tab reaches the skip link, explicit profile ID, private draft, GET and reset controls.
Tab/Enter performs a real read against this client's fixed provider. Nothing is selected
or successfully observed by default. The datalist comes directly from immutable C020,
not a copied profile catalog. Drafts remain in this page's memory and are never sent.

* GA is the synthetic local label for unchanged `getProfileV1`; preview labels unchanged
  `getProfileV2`. Both preserve **`getProfile/1`** and the same old-consumer profile semantics.
  `1.0.0` and `2.0.0` are compatible implementation labels, not breaking API versions.
* Successful observations contain the actual request/response URL, GET status, and exact
  server-owned implementation/deployment headers matching the unchanged C020 body.
  Label matching is local source integrity, **not** cryptographic trust or authentication.
* Invalid/empty IDs produce explicit error UX without a request. Unknown synthetic IDs
  produce real local HTTP 404. Transport failure has a null HTTP status/response URL,
  not invented success. Errors clear only that client's stale profile result.
* Editing a profile ID clears only its own old observation. Native reset clears its own
  profile, draft, result, error and request evidence, retaining native button focus.
  It works when a real form control shadows `form.reset`; no shadowable method is called.
  Reset during a pending read aborts it and prevents late completion from restoring old state.
* The other client's profile, draft, result, error, destination and evidence stay unchanged.
  There are no cookies, authentication, credentials or persistent-storage sessions.
* Static/nonserver execution and missing/invalid scope remain visibly **UNKNOWN** with
  submission disabled. A previous actual server scope announcement is not a health guarantee.

## Closed server and C041 boundaries

Only `/`, `/client.js`, `/client.css`, the exact C020 contract/inspector bytes,
`/client.json`, and this lane's fixed `/fixtures/v{1|2}/getProfile?profileId=synthetic-NNN`
exist. GET/HEAD only; no proxy, arbitrary target, JSON candidate oracle, user data, write
endpoint, repository/evidence route or lesson mount exists. Foreign/opaque Origin, foreign
Host, raw traversal/encoding, extra or duplicated fields, bodies, cookies, authorization
and all caller `X-*` overrides are refused. Excess headers can be refused by Node's parser
with an empty HTTP 400 before application handling; the application also has a 24-header guard.

Bounds: 5-second server startup with an exact-owned abort signal; 4-second requests;
16 connections; 24 headers / 8 KiB header bytes; 256 total requests and bounded audit entries
per listener; 1–120-second API lifetimes. Only a strict own `ttlMs` data option is exposed
to the Node API; the CLIs accept no arguments. Every exact owned listener is closed in
`finally`, even if opening the second client fails.

C041's reviewed **A-S001/A-S003** allowlist, opaque sandbox, CSP and operating limits are
read-only pinned dependencies. Nothing imports its host as an authorizer, mounts a lesson,
adds `allow-same-origin`/popups, builds a child-parent bridge or weakens its policy.
This client's CSP allows its own scripts/styles/read-only connections and denies frames,
images, workers, objects, forms, inline script and evaluation. No CORS grant is emitted.

The verified helper buffers guarded `route.fetch({maxRedirects: 0})` responses and forwards
the real owned-server headers/body into the actual DOM. It blocks other origins, writes,
redirects, service workers and WebSockets. Evidence is **not native Chromium TCP, CORS,
WebSocket, transport or general lifecycle qualification**. Returned CSP and helper policy
both apply to foreign-origin denial; tests do not falsely attribute that denial to one layer.
The published helper still has its documented overall context creation/shutdown lifecycle
limitation. Observed clean bounded runs do not erase it, and no helper patch or unsafe
process-recovery workaround is supplied.

## Verify without rewriting evidence

With capture variables unset:

```powershell
node --test --test-reporter=tap .\capability\C045\tests\server.test.cjs .\capability\C045\tests\guards.test.cjs .\capability\C045\tests\integrity.test.cjs
node .\capability\C045\tests\syntax.cjs
node .\capability\C045\tests\browser.cjs
```

The browser runner checks the actual Microsoft signature, exact approved versions and
published helper SHA-256 before opening. It verifies actual page/context/browser references,
native keyboard, both profiles through both implementations, real destinations/header/body
coherence, two-way noninterference, HTTP and transport errors, reset-shadow/pending reset,
actual CSP violations and exact finally cleanup. Normal runs do not rewrite evidence.
The helper's approved disposable runtime directories are separately owned and cleaned.

Deliberate capture is explicit and always creates a new owned slot:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try {
    node .\capability\C045\tests\capture.cjs green
    node .\capability\C045\tests\capture.cjs browser
    node .\capability\C045\tests\capture.cjs readonly-browser
} finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

Other truthy values are refused. `readonly-browser` deliberately captures the outer command,
but removes capture variables from the real browser child and verifies unchanged evidence
bytes **and modification times**. Captures retain original stdout/stderr gzip, byte counts,
SHA-256, actual exit codes, commands, timestamps and source hashes. Readable logs normalize
only CRLF/end-of-line horizontal whitespace; original assertion bytes remain intact.
Windows-checkout raw SHA-256 and Git-canonical blob IDs are distinct representations, recorded
separately. Changed reviewed C020/C041/helper bytes fail closed; never silently normalize or repin.

`evidence.json` links the ordered BDD, loadable stub, genuine actual-browser RED, IaC-N/A,
implementation, failures/refinements and verification. The first consent tooling failure is
preserved but is **not** behavioral RED. Reproduce the genuine retained RED without changing
the implementation using `capture.cjs red-replay` with deliberate capture enabled; exit 1 and
three AssertionError subtests plus their failed parent are expected.

Publication does not self-accept C045 or award credit. The parent alone accepts this one
original S unit. Tests, repairs and refinements contribute **zero extra units**.
