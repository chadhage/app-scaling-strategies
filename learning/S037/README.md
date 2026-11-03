# S037 — Session serialization change

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. This is one portable A-S037 satisfier,
parent D-S037, packet SC-S037. It does not complete D-S037, B-S037 or a live migration.

## Worked exercise

The assumed shared fixture holds one synthetic session, a cart with two DEMO-PEN
items and checkout step 2. Schema 1 uses `cart` / `checkoutStep`; schema 2 renames
these fields to `items` / `flow.step`. This is actual deterministic JSON encoding
and decoding, not a production serializer or storage migration.

1. Keep **Reads schemas 1 and 2**, **Schema 1 writes**, **Intact**. Attempt transition:
   all three probes preserve the entire declared state before synthetic v2 becomes
   active. Roll back: v1 rereads the retained candidate output successfully.
2. Try **Schema 2 only**. Existing schema 1 sessions cannot be read. The gate blocks.
3. Keep the dual reader but choose **Schema 2 writes**. v2 can read both payloads,
   but v1 cannot read the candidate output. Coexistence and rollback would be unsafe;
   two good reads do not override the failed third probe.
4. Choose the **silently resets** reader with schema 1 writes. Both v2 reads
   substitute an empty cart and step 0. The state oracle detects two silent resets;
   neither is compatible merely because a deserializer returned an object.
5. Compare **Unavailable** (unknown evidence) with **Malformed JSON** (known failure).
   Neither is a successful migration. Any failure or unknown blocks exposure.

The original fixture is never rewritten. A proposed write blocked by preflight is
not committed. Candidate settings are locked while v2 is active; rollback uses
the captured candidate bytes, not later UI selections. A successful transition
already proves the old-reader probe, so an incompatible write is rejected before
there is anything unsafe to roll back.

Each result separates read-probe counts, gate verdict, synthetic user outcome and
cleanup. These probes are not HTTP responses or live user journeys. All prior
failures, unknowns, payloads and successful results remain in expandable history.
Reset restores defaults, v1, an unknown current run and reader focus; it does not
repair past failures, erase history or replenish the action budget.

## Bounds and keyboard access

- One synchronous operator, one declared session, two schema formats, three reader
  choices and three existing-payload conditions. No arbitrary code or payload input.
- At most 12 recorded actions and 12 runs per page lifetime; overruns and invalid
  commands are non-destructive. Payloads are limited to 2048 characters.
- Tab / Shift+Tab move between controls, arrow keys select options, Enter / Space
  activate buttons. Errors are announced and focused. No control shadows `form.reset`.
- History is in memory only. Reload clears it; neither reset nor verification
  writes browser storage. Save relevant evidence separately before closing a lesson.
- Strict CSP permits only local scripts/styles; connections, inline execution,
  frames, workers, objects and form navigation are denied.

## Focused verification

From the repository root in PowerShell, using the existing Node 22 test tooling:

```powershell
node --test learning\S037\tests\model.test.cjs learning\S037\tests\page.test.cjs
node learning\S037\tests\syntax.cjs
node learning\S037\tests\browser.cjs
node learning\S037\tests\integrity.cjs
```

Ordinary commands are read-only to proof. The actual browser protocol uses only
the published `testing\browser\isolated.cjs` (SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
published revision `53c0c0d`), `openIsolatedLesson`, and awaited `close()` in
`finally`. Offline Playwright 1.56.1 and installed, signed Edge 156 are explicit;
there is no download, package installation, integrated-browser lease, unsafe flag
or abandoned lifecycle prototype. The shared helper's documented unattended
lifecycle limitation remains a tooling limitation, not a qualified CI guarantee.

Deliberate browser capture uses `CAPTURE_BROWSER_EVIDENCE=1`. Historical files
are immutable: this protocol refuses to overwrite an existing observation.
`tests\capture.cjs` separately requires `CAPTURE_TEST_EVIDENCE=1` for the named
RED, replay, GREEN, syntax or browser capture. Integrity creation requires
`CAPTURE_INTEGRITY_EVIDENCE=1`. These are explicit producer operations, not ordinary
verification. Exact stdout/stderr bytes, lengths, SHA-256 and base64 are retained
in the capture JSON; readable `.txt` logs only normalize line endings and trailing
whitespace for the publisher. The owned `.gitattributes` disables newline conversion
so byte digests survive Windows checkout; ordinary whitespace checks stay enabled
and recognize CRLF line endings.

The BDD feature preceded a loadable stub and genuine `unknown` versus `success`
assertion RED, followed by explicit IaC N/A and implementation. Exact stub and
original test snapshots use `.snapshot`, outside automatic test discovery.
`node --test learning\S037\evidence\red\replay.cjs` explicitly replays that expected
failure; exit 1 is correct for this historical replay, not part of the GREEN suite.

## Limits and remaining work

No Azure, IaC, identity registration, credentials, deployment, expenditure, native
platform result, Node 24 production validation, concurrency, real shared-store
durability, authentication or reliability SLA is claimed. The S031 local prerequisite
is represented by an explicit assumed shared fixture, not by certifying its native
parent. B-S037 still needs approved CORE / DATA / HOST, actual fixture clients,
serializer transitions and rollback evidence on a qualified host.

The relevant To Do boundary is to retain that genuinely gated native remainder;
do not create a second test, refinement or plumbing credit for this one lesson.
The [source README S037](../../README.md#d-sessions-authentication-and-user-state),
[D-S037 acceptance](../../.docs/wiki/backlog.md#d-sessions-authentication-and-state)
and [portable A-card contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract)
remain authoritative.

Provided “AS IS” for education, without warranties or guarantees. References to
Microsoft and Azure do not imply endorsement, certification or support; 99.999%
is a project target, not a Microsoft SLA. See the
[Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
