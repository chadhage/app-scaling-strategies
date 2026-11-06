# C032: an authenticated cookie-less client whose observations do not depend on cookies

**Training rehearsal, synthetic data, local loopback only, not a live Azure result.**

Original **C032 / S / P0 / H006**, entry gate: accepted C020. This delivers one local fixture and its proof,
not the deployed Node 24 / Express / Entra control API, not real identity verification and not a native-host
transition (that is B-S040's later work).

## What it proves

A loopback server on `127.0.0.1` (automatic port) serves one authenticated route.
An explicit synthetic opaque credential travels in `Authorization: Bearer ...`, never in a cookie.
The server answers with two **server-owned** observations:

- **destination**: which synthetic destination served the request (`synthetic-destination-blue` 1.0.0 for a
  client's first two served requests, `synthetic-destination-green` 2.0.0 afterwards);
- **state**: a per-client served-request counter (`state.counter`, 1-based).

Real loopback HTTP tests (no mocks of the server) show:

1. The same authenticated request sequence, including the blue to green transition and two interleaved clients, gives
   **deeply equal observations** with no `Cookie` header, with a conflicting decoy cookie on every request, and with a
   cookie jar that a foreign loopback origin handed `Set-Cookie` attempts. A fourth run alternates the three regimes
   request by request. The server-side request hook records the `Cookie` header it was really sent, so each regime is
   shown on the wire and the equality is not vacuous.
2. The server **never emits `Set-Cookie`** and no response header lies outside a closed allowlist (success, every
   failure, assets, scope, 404 and 405). A jar that only talks to the fixture stays empty. The server never reads the
   `Cookie` header at all, so a cookie naming a destination, an identity, an affinity (`ARRAffinity`) or even a
   credential changes nothing and never replaces a missing credential.
3. A missing, malformed, forged or expired credential, or two `Authorization` headers, is an explicit typed failure
   (`CREDENTIAL_MISSING`, `_MALFORMED`, `_FORGED`, `_EXPIRED`, `_AMBIGUOUS`) with a Bearer challenge on 401. Failure
   bodies carry no client, destination, state or stamp, and a failed request advances no counter, so there is no default
   identity. Expiry follows a **logical epoch** held by the server (a later epoch expires every credential), never the
   wall clock.
4. Observations are server-owned: any query parameter or body is rejected (`INVALID_QUERY`, `UNEXPECTED_BODY`) and
   caller headers such as `X-C032-Destination` or `X-C032-Stamp` are ignored and never reflected.
5. The **cookie-less client** (`client.js`, one UMD file used by Node tests and by the page) sends `credentials: 'omit'`,
   exactly `Accept` plus one `Bearer` header (or no credential at all, never a default), refuses a server that sets a
   cookie, and rejects any body or header set that is not exactly the closed observation contract.

The **page** (`index.html`, `page.js`, `style.css`; no inline script, the same strict CSP as C020) fetches with
`credentials: 'omit'`, shows the server's client, destination and counter next to the browser's `document.cookie`,
and can set and clear conflicting decoy cookies (`c032_destination`, `c032_client`, `ARRAffinity`).

## Conduct locally

```powershell
node capability\C032\server.cjs
```

The CLI rechecks current C001 `local.probe` consent (`guardOperation` from the accepted C001 guard against
`.docs\wiki\flow-state.json` `approvals.C001`), binds **only `127.0.0.1` on an automatically assigned port** and prints
the exact origin and owned PID. It accepts no host, port, identity, credential, destination, stamp or consent override
and closes itself after 10 minutes. Stop your own CLI with Ctrl+C. Try the credential list in the page: alpha and beta
are valid, then the expired, forged, empty and absent cases. Set a decoy cookie that names green, observe, then name blue
after the third observation: the server-owned plan wins every time.

Routes (read-only `GET` only): `/api/v1/observation` (authenticated), `/scope.json`, and the allowlisted `/`,
`/contract.js`, `/client.js`, `/page.js`, `/style.css`. Everything else is 404, other methods 405 with `Allow: GET`.
`GET` is used even though a served request advances the counter, because the approved browser helper permits only GET and
HEAD. The counter is a server-owned served-request count, not a caller-controlled write.

## Verify (the independent reviewer re-runs exactly these)

All commands run from the repository root in PowerShell 7. Normal checks write nothing.

```powershell
# 1. RED replay: the retained initial specification against the retained naive cookie-session stub.
#    Expected: exit 1, 8 AssertionError failures and 1 pass (the stub is correct only when no cookie is involved).
$env:C032_TEST_SUBJECT = '.\server.stub.cjs'
try { node --test capability\C032\evidence\red\server.initial.snapshot.cjs } finally { Remove-Item Env:\C032_TEST_SUBJECT }

# 2. GREEN: the whole non-browser suite (111 tests). The same initial specification also passes against server.cjs.
node --test --test-concurrency=1 capability\C032\tests\fixture.test.cjs capability\C032\tests\server.test.cjs capability\C032\tests\regimes.test.cjs capability\C032\tests\client.test.cjs capability\C032\tests\page.test.cjs capability\C032\tests\cli.test.cjs capability\C032\tests\surface.test.cjs capability\C032\tests\red.test.cjs

# 3. Per-file coverage 85/85/85 over the ENUMERATED production files (an unloaded file counts as 0%).
#    Whole-namespace coverage run: take a heavy slot first when the shared run folder is in use.
node capability\C032\tests\coverage.cjs

# 4. Real isolated headless Edge observation (take a heavy slot first). CAPTURE_BROWSER_EVIDENCE stays unset: nothing is written.
node capability\C032\tests\browser.cjs

# 5. Read-only integrity of the whole evidence index (22 hashes, RED exit 1, GREEN 111 tests, per-file coverage rows).
node capability\C032\tests\verify-evidence.cjs
```

The archives were produced by `tests\capture.cjs`, which runs one Node command and writes a NEW unique directory
(`evidence\red|green|coverage\<stage>-<id>\`: gzip of the raw stdout and stderr, the exit code, and the SHA-256 of the
inputs). It never overwrites. `evidence.json` records, in order, BDD, stub, RED, implementation, GREEN, coverage and
browser evidence; `surface.test.cjs` re-checks the stable part of it inside the suite and `verify-evidence.cjs` checks
the rest, because the GREEN and coverage archives record that suite's own run.

The archived RED is `evidence\red\behavioral-red-<id>\` (`stdout.raw.gz`, `stderr.raw.gz`, `run.json` with the exit code
and the SHA-256 of the feature, the specification snapshot and the stub). It is immutable: `tests\red.test.cjs` checks
its bytes, its eight `AssertionError` failures and a live replay. The red stub, the snapshot and the feature are never
edited. `.gitattributes` (`* -text`) keeps every byte exact, including CRLF.

### Coverage and what is not measured

`production-files.cjs` enumerates `client.js`, `contract.js`, `fixture.cjs`, `page.js` and `server.cjs`; `coverage.cjs`
runs one nested `node --test --experimental-test-coverage` over every suite, reads each file's row and fails below 85
line, 85 branch and 85 function coverage for **any** file or for a file with no row. Browser-only `page.js` (and the UMD
branch of `contract.js`/`client.js`) is measured under Node with a DOM stub built from the real `index.html`
(`tests\dom-stub.cjs`, scripts run in the real `index.html` order through `vm.Script` with file-URL names). `index.html`
and `style.css` are markup and styling that Node coverage cannot measure; they are disclosed, never counted or excluded.
The only uncovered lines are the two `require.main === module` entry lines of `server.cjs`, which only a real child
process executes (the child is started with an empty `NODE_V8_COVERAGE`, because Node re-injects the variable into
children when it is merely deleted).

### Browser observation

`tests\browser.cjs` calls `openIsolatedLoopback('capability\C032\index.html', server)` from the pinned shared
`testing\browser\isolated.cjs` (SHA recorded in `imports.json`), with the exact owned server handle from `startLocal()`
(a live C001 consent recheck; it retries a torn ledger read three times, so rerun it if the coordinator was writing the
ledger at that moment), and awaits browser and server closure in `finally`. It checks that the installed Edge is
Microsoft-signed and within the qualified major version 156 (the actual version and SHA-256 are recorded, never pinned),
then drives the real page with real clicks and one keyboard activation: first observation with no cookie, conflicting
decoy cookies in the real browser cookie jar, an unchanged observation, a sticky decoy that cannot hold the client past the
transition, the four typed failures that clear the display, per-client state, and a final check that the page made
only credentials-omit GET requests to its own origin, saw no `Set-Cookie` and raised no page error.
The helper forwards requests through Playwright `route.fetch({maxRedirects: 0})`. That is **not native Chromium TCP,
CORS, SSE, cookie-policy or Azure qualification**, and the record states what the server actually received. Only a
deliberate `CAPTURE_BROWSER_EVIDENCE=1` run writes one new unique directory `evidence\browser\browser-<id>\`.

## Boundaries and operating envelope

- Approved production stays **Node.js 24 LTS / Express / App Service Linux with Microsoft Entra ID**; this Node-builtin
  fixture is local test tooling on Node 22. Credentials are fictional opaque strings, not Entra tokens; no identity is
  verified, no role or lease boundary exists, and no durable store, slot, container, region or SKU is qualified.
- C001 consent is local-only: no Azure, registration, deployment, credentials, price quote or spending. **IaC is N/A**
  (no Dockerfile, no Bicep).
- `evidence.json` indexes the ordered BDD, stub, RED, implementation, GREEN, coverage and browser evidence.
  `imports.json` pins the only imported producer file set (C001 `contract-guard.js` and `approved-contract.js` at the
  accepted commit, canonical LF SHA-256). No C020 or C033 bytes are reused.
- Parent/controller accepts **one original C032**; tests, repairs and evidence earn zero extra credit. H006 stays
  incomplete (journeys, effects, migration and native transport are other cards).
