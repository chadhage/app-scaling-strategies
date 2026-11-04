# C033: actually hold a browser journey boundary

**Training rehearsal - synthetic data - not a live Azure result**

Original **C033 / S / P0 / H006**, entry gate independently accepted C020
`2dc471daab3ffa202d83aba2df443e280cad3656`. This delivers one local two-read
segment, not a complete H006 journey, native transport/lifecycle test or source scenario.

## Conduct locally

```powershell
node capability\C033\server.cjs
```

Open the **actual URL printed with the actual owned PID**. There are no host,
port, identity, provider, consent or target options. Installed PowerShell 7
(`pwsh.exe`, without policy overrides) reads current C001 consent under
`Local\AppScalingStrategies_KanbanState_v1`; its file handles close before
release. `guardOperation('local.probe', currentApproval)` must strictly allow
the operation, and the exact C020 must already be independently accepted.
Missing, changed or unavailable consent/gate fails visibly before listening.

Choose a synthetic profile, an enum-valued synthetic draft, a boundary and an
original budget. Tab from the budget selector to **Start original attempt**,
then Enter. At the boundary use **Resume original attempt** with Enter/Space.
Stop and Reset also support keyboard activation.

- **Before first read:** the driver holds with **zero** provider requests.
- **Between acknowledged reads:** v1 has actually replied and its profile is
  retained; the driver holds before issuing v2, with **one** provider request.
- Resume releases the same waiting driver, preserving its original attempt,
  draft, profile and deadline. The UI's 50 ms timer only reads observations;
  it never advances the journey.
- Actual `performance.now()` elapsed and held duration continue during the
  pause. A 1000 ms budget can expire while held; Resume cannot restart it.
  Reported values are measured per run, not fixed elapsed-time promises.
- `synthetic-999` produces an actual failed HTTP 404, not a default success.
  Stop/Reset at a boundary retain explicit interrupted **unknown** history and
  do not release a next read. A later attempt has a new synthetic identity.

Type `stop` and Enter, or Ctrl+C, to await closure of this exact server.
The listener self-closes after **120 s**; each attempt has a **45 s** TTL,
each read a **2500 ms** limit, startup **5000 ms**, and consent read **10000 ms**.
There are at most 16 attempts per page and 128 provider reads per listener.
History is retained by refusing further attempts, not silently dropping errors.
History is memory-only and ends when the isolated page closes. No cookies or
browser/durable storage are used. Static-file mode disables the journey and
explicitly makes no HTTP/pause/timing observation.

## Read-only closed fixture

Only own `/`, `/journey.js`, `/page.js`, `/style.css`, and:

```text
/fixtures/v1/getProfile?profileId=synthetic-001
/fixtures/v2/getProfile?profileId=synthetic-001
```

are served. These call the accepted C020 `getProfileV1` / `getProfileV2`
providers and import their immutable catalog/stamps **read-only**. They are
two actual implementations preserving `getProfile/1` business values, not
painted/version-only replies. The original catalog-scan and indexed
implementations, profiles and synthetic deployment labels are unchanged.
Foreign Host/origin, write methods, CONNECT/upgrades, bodies, extra/duplicate/
encoded queries, arbitrary paths, header overrides and redirects are denied.
There is no proxy, arbitrary target, authentication, real-data API or mutation.
Exact immutable stamps/header coherence are local fixture checks, not
cryptographic identity or cloud attestation.

## Verify without rewriting evidence

```powershell
node --test capability\C033\tests\journey.test.cjs capability\C033\tests\server.test.cjs capability\C033\tests\surface.test.cjs capability\C033\tests\integrity.test.cjs
node capability\C033\tests\syntax.cjs
node capability\C033\tests\browser.cjs
node capability\C033\tests\read-only.cjs
```

Normal checks **do not write persistent source, evidence, seals or snapshots**.
The last command snapshots own bytes/listing plus dependency bytes, runs the
focused/syntax/browser checks, and verifies they stayed identical. The approved
isolated helper uses its own transient runtime directory and awaits cleanup.
Integrity checks hash raw gzip output and working-tree bytes separately from
CRLF-to-LF / Git-canonical bytes; they never normalize or rewrite files.

The approved installed tooling is **Node 22 / offline Playwright 1.56.1 /
signed Edge 156**. The browser check records the actual owned Edge PID and
executable's valid Microsoft signature, matches its version to the actual
browser, uses only pinned shared
`testing\browser\isolated.cjs`
SHA `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
and calls `openIsolatedLoopback(ownedAnchor, actualOwnedServer)`.
It awaits browser and exact server closure in `finally`, including failure.
No helper patch, native-launcher bypass, unsafe flag, foreground lease,
package install/download, detached process or broad cleanup is used.

That helper buffers guarded `route.fetch({maxRedirects: 0})` actual local
HTTP responses into the real DOM. This is **not native Chromium TCP, SSE,
CORS, WebSocket, transport, browser lifecycle, OS or Azure qualification**.
The empirical checks cover DOM/keyboard controls, actual request holds, state,
monotonic time, original-budget miss, actual 404, Stop/Reset history, CSP and
cleanup. Malformed, interrupted/late and out-of-order replies are classified
in separately labelled oracle unit tests; the browser transport is not
artificially interrupted or reordered to manufacture that proof.

## Retained workflow and deliberate capture

`evidence.json` links BDD -> loadable stub -> **four genuine AssertionError
REDs** -> IaC **N/A** -> implementation/refinement -> focused GREEN, syntax
and actual browser checks. Raw failures, including the initial restricted
Windows PowerShell reader and CLI stdin-lifecycle failure, remain preserved.
The lawful repair uses already-installed PowerShell 7, not a policy-bypass
flag. CLI cleanup was repaired and empirically verified.

The original RED is outside test autodiscovery:

```powershell
node --test capability\C033\evidence\red\journey.initial.snapshot.cjs
```

It intentionally still fails against the untouched loadable stub. The first
capture excluded historical RED-source hashes from its walker; a separately
retained provenance recheck hashes those same unchanged files explicitly.
It does not replace or relabel the original RED.

Only a deliberate exact capture writes a **new unique own directory**:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C033\tests\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

The capture never overwrites an earlier run. Other closed capture stages in
`tests\record.cjs` are explicit evidence operations, not normal checks.
`tests\seal.cjs finalize` is a deliberate one-time finalization and refuses to
rewrite an existing manifest.

## Remaining H006 and operating envelope

`remainder.json` retains missing full journeys, effects/duplicate/missing
oracles, identity/session continuity, actual migration, backend nonbrowser
protocol drivers, interrupted native transport and lifecycle qualification.
Success of a second fixture read alone is not any of these.
Approved production **Node 24 / Express / App Service Linux** is not validated
by this Node-builtin local test fixture. IaC is **N/A**: no cloud, scaffold,
identity registration, credentials, deployment, persistence or spend.
Parent/controller alone accepts **one original C033**; tests, repairs,
evidence and refinement earn **zero extra Kano credits**. H006 and native/source
parents remain incomplete.
