# C027 — received is not accepted

**[C027][S] · H005 · one frozen S unit · accepted entry gate C020**

A real, bounded Node-builtin HTTP `text/event-stream` fixture and a trusted **file-page
native browser `EventSource`** conductor. Synthetic profiles and v1/v2 payloads come
from the unchanged C020 fixtures. This is local implementation, not a native Azure
transition, durable event store, exactly-once guarantee, availability measurement,
or production Node 24/Express certification. Test tooling is Node 22.23.4 and the
existing offline Playwright 1.56.1 / signed Edge installation. No packages or downloads.
IaC is **N/A**: C001 permits local work only; no infrastructure, scaffold, identity,
deployment, cloud access or spending is authorized.

## Conduct

From the repository root in PowerShell:

```powershell
node .\capability\C027\server.cjs
```

Open the **exact `fileUrl` printed by that process**. The ordinary `index.html` is
an unconfigured, deny-by-default template and cannot connect. The CLI has no host,
port, consent or duration overrides. Its exact server handle binds to
`127.0.0.1:0`; the OS chooses the port. It expires after ten minutes (API ceiling:
fifteen minutes); each stream also expires after thirty seconds. Ctrl+C closes
the exact owned connections/server and removes its generated `runtime-*.html` file.
Do not terminate unrelated processes or probe other ports.

1. Connect; receipt queues events but does **not** accept them.
2. Receive several events, then explicitly **Accept next event** once.
3. **Disconnect stream**: unaccepted pending events are discarded, not accepted.
4. **Connect / resume accepted**: a *new* native EventSource requests the suffix
   strictly after the accepted cursor, including earlier unaccepted receipts.
5. Accept the remaining events. A validated six-event suffix can be labelled
   `VERIFIED LOCAL ORDERED SUFFIX` while the HTTP response is **still open**.
6. Reset explicitly to clear this in-memory conductor and change profile.

Controls have native keyboard behavior, a skip link, explicit labels, separate
status/error announcements, and a focusable receipt/acceptance evidence panel.

## Protocol and honest outcomes

- Contract `C027.sse/1`, stream revision `r1`, six immutable records per C020 profile.
  IDs are stable, for example `C027:r1:synthetic-001:000001`. Sequence numbers are
  integers 1–6. Odd/even events retain actual C020 v1/v2 stamps and identical
  business semantics. No timestamps enter immutable event bytes.
- Every request supplies exactly `profileId`, `version`, `mode`, and **`after`**.
  `START` explicitly means no accepted event. Cursor six returns only the tail.
  The tail describes the finite fixture log; it does not end the live response.
- Browser `Last-Event-ID` represents **receipt**, not application acceptance.
  On error the conductor closes EventSource immediately, preventing automatic
  receipt-based retries. Explicit resume uses the accepted query cursor. A
  conflicting receipt header is HTTP 409, never permission to skip ahead.
- Receiving and acceptance are separate. Snapshots are deeply frozen copies.
  Raw received cursor/history remains inspectable even when JSON or lineage
  fails. `receivedSequence` is the latest structurally validated received number.
  Acceptance advances contiguously, only from a clean open attempt.
- Gaps and duplicates are explicit `EVENT_GAP` / `DUPLICATE_EVENT` errors.
  Neither is silently skipped or accepted twice. Invalid JSON, IDs, unexpected
  data, changed business values, contract/version or C020 lineage fail closed.
  Declared `gap`, `duplicate`, `invalid`, and `drop` modes use the real transport.
- Malformed cursor: HTTP 400 `INVALID_CURSOR`; another stream/version: HTTP 409
  `CURSOR_STREAM_MISMATCH`; future cursor: HTTP 416 `FUTURE_CURSOR`. Unknown
  profiles, versions, modes, paths and unsupported requests remain typed errors.
  The Node driver sees their JSON codes. Native EventSource does **not** expose
  HTTP status or error bodies, so its HTTP/transport failure is honestly
  **unknown**, never a fabricated successful replay or invented browser code.
- A partial stream, unaccepted tail, missing/invalid tail, connection loss or
  unobserved data cannot pass. Explicit retry preserves failed-attempt transitions
  and receipts, but no survival across process/browser restart is claimed.

The lifetime, four concurrent streams, eight conductor attempts, 64 receipt
records, 64 admitted streams, 128 total audited HTTP attempts, header/URL limits
and exact cleanup bound this educational fixture. There is no foreground lease
integration or durable state.

## File-origin trust and unchanged browser helper

`createConductor(exactOwnedServer)` generates one owned file from the template.
Its CSP permits scripts/styles from local files and **only the exact literal
`http://127.0.0.1:<actual-port>/c027/<per-listener-ticket>/events` connect path**.
There is no wildcard port, route interception, injected SSE, replacement
EventSource, bypass-CSP setting, unsafe browser flag or alternate helper.

The listener explicitly returns `Access-Control-Allow-Origin: null` for the
trusted file origin, without credentials or cookies; other origins are denied.
The random, ephemeral fixture ticket narrows reachability; it is **not**
authentication, an identity boundary, a real credential or a production design.
The conducting file is trusted local code, not an arbitrary untrusted file.

Browser tests use unchanged `testing\browser\isolated.cjs`,
published `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
**`openIsolatedLesson`**. Its guarded `openIsolatedLoopback` uses
`route.fetch` + `fulfill`, which buffers responses and **cannot certify SSE**.
That API is deliberately not used here. Tests derive every contacted port from
the returned owned listener handle. CSP negative probes use a forbidden path on
that *same* listener, not a foreign endpoint.

## Verification and retained evidence

Read-only verification, from the repository root:

```powershell
node --test .\capability\C027\tests\behavior.test.cjs .\capability\C027\tests\http.test.cjs .\capability\C027\tests\surface.test.cjs
node .\capability\C027\tests\syntax.cjs
node .\capability\C027\tests\browser.cjs
node .\capability\C027\tests\integrity.cjs --committed
```

The browser check verifies native open-stream events before response end,
keyboard acceptance/disconnect/resume, ordered suffix and unchanged stamps,
gap/duplicate/invalid/drop errors, actual native invalid/future/foreign-cursor
HTTP failures, reset and effective CSP. Its `finally` closes every EventSource,
browser context/browser, connection, timer, exact server and conducting file.
It hashes retained proof before/after ordinary verification and refuses proof
mutation. No screenshot is written in ordinary mode.

Deliberate capture only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\capability\C027\tests\browser.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Each deliberate browser attempt gets an exclusive UUID JSON file; failures are
also kept. Screenshots are capture-only. `tests\capture.cjs <unique-stage> <0|1>
<node-arguments...>` deliberately archives command stdout/stderr (gzip), exit
status and hashes without overwriting an earlier attempt. The exclusive
`tests\seal.cjs --capture` seals final owned bytes and unchanged dependency
hashes; ordinary integrity checks never refresh a seal. `--committed` also
compares every retained byte with actual Git blobs.

BDD preceded loadable stubs and **five genuine behavioral RED assertions**.
The original stub/test bytes and hashes remain in `evidence\red\*.txt`, outside
automatic test discovery. A separate real audit-accounting RED prevents falsely
equating “no successful SSE” with “no HTTP request reached the listener.”
Historical attempts remain historical; terminal verification is identified by
`evidence.json`, with source hashes and the final integrity seal.

Expected-failing, read-only red reproduction:

```powershell
node .\capability\C027\tests\reproduce-red.cjs
$env:C027_RED_MODE='audit'
node --test --test-name-pattern=read-only.audit .\capability\C027\tests\reproduce-red.cjs
Remove-Item Env:\C027_RED_MODE
```

Both commands deliberately exit 1. They use retained source bytes, not missing
imports, fake test output, changed production code or a painted browser model.

## Relevant To Do review

- C027 stays one S unit; no extra acceptance credits or unrelated work are split
  off. Parent acceptance remains required after publication.
- **B-S046 is not made ready by this fixture alone**: CORE/DATA/CONTAINER and
  actual approved native transition, client-budget and completeness evidence
  remain prerequisites. This local observation does not close H005 or H006.
- **C028 remains a separate real native gRPC driver/fixture**. SSE or ordinary
  HTTP is not an acceptable substitute; its protocol/tooling gates must be
  assessed independently. No helper expansion or abandoned lifecycle prototype
  is introduced to make either item appear ready.

Educational demonstration provided **AS IS**, without implied Microsoft
endorsement, support, or SLA. All business data is synthetic.
