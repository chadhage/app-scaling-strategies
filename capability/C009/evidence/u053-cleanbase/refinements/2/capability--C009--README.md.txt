# C009: server-side visitor, conductor and operator mutation permissions

Local, synthetic, offline fixture, not an Entra identity service or an approved cloud API. Four in-memory identities
(`visitor`, `conductor-a`, `conductor-b`, `operator`) present opaque bearer tokens to an automatic-port loopback HTTP server.
Node v22.23.4 built-ins only; no cloud, registration, infrastructure, deployment or spending authority. See `C009.feature`.

## What the server enforces

Identity comes from the verified token, never role/subject/owner claims. The command/role table is deny-by-default.
A presented malformed, unknown or expired credential is refused rather than degraded to anonymous access.
Mutations are POST commands; reads and the authorization preview are GET. Permission is rechecked at the committed effect.
The commit queue linearizes changes; refused commands preserve state/revision and record the server-derived identity.

The central refusal path marks the request socket synchronously, stops reading, drops work behind the refusal and ends the
connection after the answer. Per-connection lanes preserve requests before a refusal, including HTTP/1.0 and mixed framing.
Node-own answers use the same path. The reading-stop self-check fails closed when the Node internal is unavailable.
All eleven production files are the exact accepted f95cc52a29cf Git blobs; U053 changes documentation, tests and evidence only.

Limits remain those of the frozen implementation: 4096-byte body, four queued/running requests per connection, 256 connections,
1000 state entries with a 400-entry per-identity quota, bounded audit rings and synthetic token lifetimes.
Reads are public by design: C010 and other importers must not infer per-owner read isolation.
The default idle/header timeout ordering can close a stalled request silently; the U057 diagnostic is a known hint, not a U053 fix.
No new timing, memory, load-reliability or native-platform guarantee is claimed.

### `http-io.cjs` for importers

The file opens with the four rules; its exported API and the server wiring are checked against the real frozen module:

- `createResponder(response)` gives `json(status, value, headers)`, `file(buffer, type)`, `fail(code, body, headers)` and `proceed()`.
  A status of 400 or more marks `response.req.socket` before writing, sends `Connection: close` and stops reading after the answer.
  Never obtain a queued response's request socket from `response.socket`. `proceed()` writes 100 Continue immediately before reading.
- `createLanes({ depth })` returns `admit(request, response, task)` and `admit.refuse(socket, code)`.
  Work is served in order; marked sockets admit nothing and drop their queue. The depth guard cuts excess running/queued work.
  Node-own refusals belong behind legitimate requests before them, not outside the lane.
- `isFinished(socket)` is checked after awaits and before effects. Other helpers are `endConnection(socket)`,
  `canStopReading(owner)`, `clientErrorCode(error)`, `localGuard`, `hasBody` and `readBody`.
- Wiring matches `server.cjs`: `http.createServer({ requireHostHeader: false, ... }, (q, r) => admit(q, r, route))`;
  `checkContinue`, `checkExpectation`, `clientError` and `connect` go through the same admission/refusal path.
  `connection` and `listening` perform the reading-stop checks. `maxRequestsPerSocket` is not an ordering guard.
- Reuse the proof too: `tests\pipeline-rows.cjs`, `tests\pipeline-matrix.cjs` and `pipeline-node-own.test.cjs`.

## Commands

From the repository root, with the qualified Node runtime:

```powershell
node capability\C009\tests\u053-suite.cjs suite
node capability\C009\tests\u053-suite.cjs coverage-all
node capability\C009\tests\u053-fresh.cjs lf
node capability\C009\tests\u053-fresh.cjs crlf
node capability\C009\tests\u053-fresh.cjs bare
```

The suite enumerates all 39 current test files and all eleven production files. Coverage uses the entire suite, explicitly includes
each production file, and rejects an unloaded or sub-85 line, branch or function row independently. There are no production exclusions.
The historical R11 capture has 37 files and 423 tests (source record `evidence\u053-cleanbase\history\r11-suite.record.json`).
Those historical figures are not the current suite's test count; current observed counts are recorded by the final evidence phase.

## Load-evidence honesty: F9c remains open

The historical plain whole-suite capture does not provide per-file duration entries in its passing TAP.
No whole-suite-under-load capture exists. The following are seven completed failed runs, spanning five test families, not seven
independent families or passing load proof. Counts come from each retained original stream's FLAKE HUNT/BAD records, not its last
nested TAP summary. See the unchanged source note `evidence\u053-cleanbase\history\NOTE.txt`.

- resources, superseded attempt 1: **5 bad of 64** (`evidence\u053-cleanbase\history\loop-resources-attempt1.record.json`).
- resources, superseded attempt 2: **19 bad of 64** (`evidence\u053-cleanbase\history\loop-resources-attempt2.record.json`).
- resources, final R11 bytes: **4 bad of 64** (`evidence\u053-cleanbase\history\resources-final.record.json`).
- refusal-flood, final R11 bytes: **64 bad of 64** (`evidence\u053-cleanbase\history\refusal-flood-final.record.json`).
- pipeline-process, final R11 bytes: **63 bad of 64** (`evidence\u053-cleanbase\history\pipeline-process-final.record.json`).
- pipeline-refusal-mixed, final R11 bytes: **21 bad of 64** (`evidence\u053-cleanbase\history\pipeline-refusal-mixed-final.record.json`).
- pipeline-refusal-http10, final R11 bytes: **15 bad of 64** (`evidence\u053-cleanbase\history\pipeline-refusal-http10-final.record.json`).

All five completed loops of the final R11 bytes failed by the runner's 60 s per-file cap, including subordinate cancellation;
their recorded reasons are not specified-behavior assertion failures. The HTTP/1.1 pipeline-refusal loop was stopped unfinished and
not retained; no completed denominator exists. U053 starts no burners and makes no new load-success or duration-waiver claim.
Residual test-cost work belongs to U050.

## Accepted-base, append-only evidence

The fresh authority starts at the accepted f95 Git tree and its exact `evidence\green-fix2\suite.json` manifest, not an unpublished
draft seal. `evidence\u053-cleanbase\base.json` and `evidence\u053-cleanbase\catalog.json` pin all 427 accepted files and eleven
production blobs. New numbered clean-base addenda retain replaced accepted README/test bytes without changing old manifests or raw.

`evidence\u053-cleanbase\subjects.json` pins 179 exact pristine inputs of three third-fix REDs and two superseded resource loops.
README contract runs consume the actual second-fix README. The server-only RED consumes its actual server-hole specimen;
it has no invented README input. Source-manifest text snapshots are immutable witnesses, not active captures at a relocated path.
Historical and new stream transports explicitly distinguish portable projections from original private raw streams and pin both hashes.

The entire rejected unpublished draft chain, its identifier-bearing streams and its incorrect overbroad probe remain immutable
private history. They are not ancestors or files of this public package. The new role-correct three-test oracle is captured RED
before application and GREEN unchanged. No old wrong-probe 3/3 claim is made.

Bare fixtures clear inherited Git/Node contexts, use an owned drive root and a physical-parent discovery ceiling, and require Git
to discover no repository. Only repository-dependent checks skip, with reasons; the real repository's changed-pin control still fails.
Current consumer suites use exact read-only snapshots and owned short aliases; no C010 production or import-authority pin is changed.

Already accepted U034 evidence observed twelve C009 browser checks on the same canonical production/page bytes under signed
Edge 157.0.4341.42. That is labeled reused U034 evidence, not a new U053 browser run, qualification, policy append or 158 approval.
