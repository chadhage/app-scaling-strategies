# C020: compatible getProfile fixtures

This is a small **synthetic, local-only** H005 fixture, not the full harness, a real identity service, or the approved deployed Node24 Express control API. It uses Node builtins as test tooling.

## Conduct locally

```powershell
node capability\C020\server.cjs
```

The CLI rechecks current C001 consent, binds **only `127.0.0.1` on an automatically assigned port**, and prints the exact URL and process ID. Open that URL. Use Tab/Enter on **Inspect both implementations**. Inspect `synthetic-001` and `synthetic-002`; try `synthetic-999` or an empty ID to observe explicit failure and cleared stale results. The candidate JSON panel rejects missing/forged stamps, altered business data, and malformed JSON. Candidate validation is not a new HTTP observation.

Stop your own CLI with Ctrl+C. Automation must close its exact returned server handle or its recorded process/session ID, never a process name. Nothing listens after the automated tests finish.

Read-only routes:

- `/fixtures/v1/getProfile?profileId=synthetic-001`
- `/fixtures/v2/getProfile?profileId=synthetic-001`
- `/scope.json` — observed local tooling and explicit nonqualification flags, not a health guarantee.

Missing/duplicate/extra parameters, malformed identifiers, unknown profiles, unknown versions, write methods, foreign origins, and forged Host headers fail explicitly. Caller version/deployment headers are not reflected. There is no default user, profile, implementation, or successful observation.

## Contract and stamps

Both `getProfileV1({profileId})` and `getProfileV2({profileId})` preserve **`apiContract: "getProfile/1"`** and identical profile values. The former uses a catalog scan, the latter a private index. An unchanged old consumer reads `id`, `displayName`, `email`, and nested preferences through either. The implementation versions **`1.0.0` / `2.0.0` are not breaking API contract versions**.

`contract.js` recursively freezes the synthetic catalog and exact expected stamps. Each call returns an independently cloned, deeply frozen profile and stamp; a mutable JSON client copy cannot alter subsequent reads. Direct requests accept only the own data field `profileId`—no caller-owned stamp, version, deployment, or contract overrides.

`deploymentStamp: C020-loopback-v{1|2}-r1` is an immutable **local fixture label**, not a cloud deployment observation. Stamp trust here means server-owned constants, no caller override, coherent response headers/body, and exact inspection against the bundled catalog/stamps. It is not a cryptographic signature, remote attestation, authenticated identity, or a production security boundary. These immutable fixture revisions change only through reviewed source changes. The evidence capture records SHA-256 source hashes.

## Verify

```powershell
node --test capability\C020\tests\profile.test.cjs capability\C020\tests\inspection.test.cjs capability\C020\tests\server.test.cjs capability\C020\tests\surface.test.cjs
node capability\C020\tests\syntax.cjs
node capability\C020\tests\browser.cjs
```

The browser check requires the verified shared `testing\browser\isolated.cjs` **`openIsolatedLoopback(relativeOwnedIndexPath, server)`** API and its existing installed tooling. It opens an isolated headless Edge context, uses actual DOM/keyboard/HTTP assertions, and closes browser and exact owned listener in `finally`. It never uses the integrated foreground browser or bypasses the helper's path/network guards. No packages are installed by this capability.
The helper forwards same-owned-origin read-only HTTP with guarded `route.fetch({maxRedirects: 0})` and fulfills the real server response unchanged. It blocks redirects, other origins, writes, WebSockets, and service workers. This proves browser behavior against actual fixture responses, **not native Chromium TCP transport qualification**. The server remains caller-owned.

`evidence.json` links the ordered BDD/stub/RED/IaC-N/A/implementation/GREEN/syntax/browser evidence. `tests\capture.cjs` preserves raw stdout/stderr as gzip (including original assertion whitespace), actual exit codes, runtime, commands, timestamps, and source hashes. The original loadable stub and initial tests are retained, not replaced with a retrospective RED narrative.

To reproduce the original behavioral RED **without changing the implementation**:

```powershell
$env:C020_TEST_SUBJECT = '.\profiles.stub.cjs'
try { node --test capability\C020\evidence\red\profile.initial.snapshot.cjs }
finally { Remove-Item Env:\C020_TEST_SUBJECT }
```

The expected result is four `AssertionError` failures, not import or syntax failure. This variable belongs only to the retained historical test, never to the fixture/server.
Retained RED tests use `.snapshot.cjs` names so ordinary `node --test` discovery does not execute intentional failures. The historical execution records retain their original paths; `evidence.json` records the byte-preserving renames and provenance.

## Operating envelope

C001's approved design remains **Node.js 24 LTS / Express / App Service Linux**; the actual evidence records the test runtime separately. No production-runtime compatibility or full Express control API is asserted.

All names/emails/preferences are immutable synthetic business data, using reserved `example.invalid` addresses. The transport is loopback HTTP, not deployed HTTPS. There is no Entra verification, server-enforced role/lease boundary, registration, real data store, Azure management, slot/container qualification, deployment, or spending. Native OS, SKU, region, tenant, subscription, and resource group remain unapproved. IaC is **N/A**; no Dockerfile or Bicep is generated. This single C020 unit does not complete H005's session/database/cache/queue/worker work.
