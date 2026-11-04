# C018 — reopen actual run progress

**Training rehearsal - synthetic data - not a live Azure result**

Original **S / P0 / LP-REPLAY**, gate **accepted C015 Done**, parents **H004/H008**.
Only parent acceptance earns this card's one S. Tests, fixes and repeated proofs
earn no additional credit. The source parents, native qualification, queued
workers and production Node 24 remain incomplete.

## Actual inspection

From the repository root:

```powershell
node capability\C018\cli.cjs read synthetic-restart-v1 synthetic-run-001
node capability\C018\cli.cjs read synthetic-restart-v1 synthetic-run-002
node capability\C018\cli.cjs serve synthetic-restart-v1
```

Open the printed literal `http://127.0.0.1:<ephemeral-port>/`. The owned listener
expires after three minutes; Ctrl+C also closes only this listener. Supply the
exact run ID, Tab to **Reopen by ID**, then Enter. **Reconnect** rereads the same
selected ID in another genuinely fresh Node process. The complete unchanged C015
restore receipt, its disk state, acknowledgment, digest, history and current
completed/pending fields are visible. No pending action is executed.

`reader.cjs` calls unchanged `C015.restore(namespace, runId)` without a fallback.
`process-reader.cjs` invokes the actual `fresh-reader.cjs` child on every CLI/HTTP
read and correlates its actual PID. `reader.d.ts` imports C015's existing types.
There is no duplicate run catalogue, persisted schema, storage, new run field,
create/default-run API, advance/finish control, cancellation, repair or disk reset.
The browser checks read identity, acknowledgment and step/history order; C015
alone validates its complete existing storage schema and C002 envelope.

The retained C015 demonstration is immutable. Its currently observed epochs are
read, not inferred from a packaged catalogue. Fresh tests create different
`C015\test-scratch\test-UUID` namespaces through **C015 public persist only**,
with current literal C001 and C015 consent reread by C015 before mutations.
No inspection writes state. Never use another worker's test UUID.

## Unknowns, errors and limits

Blank, wrong-type, differently cased, unknown or missing IDs fail explicitly.
Selecting another ID, a read failure or a connection loss invalidates current
success immediately. Missing/corrupt/schema/consent/storage errors pass through;
an unobserved writer marker is **HOLD_UNOBSERVED**, not previous-epoch success.
No automatic reconnect changes or recreates a stored run.

**Reset display only** clears current presentation and returns keyboard focus to
Run ID. Earlier failed/unknown inspection observations remain in that client's
bounded 64-entry journal. A full journal holds without evicting history. This is
transient inspection presentation, **not persisted C015 run state or a complete
cross-client error ledger**. A new client cannot recover another client's journal
from C015; retained raw acceptance evidence keeps earlier cross-client failures.
A recovered connection does not reinterpret the original failed connection as
an uninterrupted journey or earn a reliability metric.

Opening `index.html` directly is explicitly **UNKNOWN**, with read/reconnect
disabled and no bundled run data. It is not live disk reading or fake reconnect.
HTTP inspection is an observed snapshot, not streamed progress, authentication,
provider/version qualification or a live Azure result.

The closed listener serves only `/`, three exact assets and
`/api/runs/EXACT_ID`; only GET/HEAD are supported. It rejects foreign Host/Origin,
encoded/query/traversal paths, writes and redirect routes. Current C001
`local.probe` is rechecked **before each listener** using C015's mutex-protected
current approval read; the unsafe default C001 ledger reader is not used.
All ledger mutex handles are released/disposed by the unchanged C015 reader.
CSP blocks inline scripts/styles, foreign connections, forms, frames and workers.
No public/network listener, authentication service, arbitrary command or proxy
is exposed. Local cooperative regular-filesystem/process-restart limits remain
those of C015; this is not power-loss or distributed durability qualification.

## Verification and preserved evidence

```powershell
node capability\C018\tests\verify.cjs focused
node capability\C018\tests\verify.cjs syntax
node capability\C018\tests\verify.cjs browser
```

Normal verification is **read-only for source/evidence and retained fixtures**.
It hashes C018 before/after and verifies separate raw CRLF and canonical Git
dependency pins. Publisher authorization is a separate exact-SHA publication
gate: read-only tests report its current match or explicit hold, never authorize
changed publisher bytes. Test setup alone creates unique C015 scratch; cleanup removes
only specifically tracked regular files and their empty directories, never the
category root, another UUID, shared source or retained demonstration.

BDD precedes the retained loadable-stub assertion RED against actual prepared
disk progress, then explicit IaC N/A, implementation and focused GREEN. Actual
public C015 interrupted writers cover marker holds, including partial corrupt
bytes. Standalone corrupt/schema/storage error forwarding units are labelled
unit checks, not invented on-disk corruption or browser proof.

`evidence\` preserves unique raw captures and all failed attempts. C002's existing
published documentation-only follow-up is pinned separately from its original
API publication; no dependency was edited to repair that first pin attempt.
Raw TAP padding/CRLF and RED source snapshots are preserved with narrowly scoped
attributes; normal source and the standard publisher retain real whitespace
guards. Historical evidence is never rewritten.

Only deliberate exact `$env:CAPTURE_BROWSER_EVIDENCE='1'` permits
`node capability\C018\tests\capture.cjs browser` to create a new UUID raw capture.
Remove the environment variable afterwards. Plain browser verification never
refreshes evidence, source, fixtures or bundled data.

Browser proof uses approved offline **Playwright 1.56.1**, installed **Microsoft-
signed Edge 156**, and **Node 22.23.4** tooling. The published helper is pinned to
`86c80bc2…` and receives this owned anchor and the actual caller-owned Node server.
It buffers/forwards real HTTP responses with redirects disabled; this is **not
certification of Chromium's native TCP transport**. All exact owned browser and
listener handles are awaited closed in `finally`. Its documented lifecycle
limitations are not silently promoted to unattended CI qualification.

Publication uses only parent-approved standard `publish.ps1`, current exact SHA-256
`f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4`.
The task's original `48846487727dd2ef35f03d88d65e64121059b6867188bbf34daeaee3fda1c09d`
boundary and genuine pin-hold failure remain archived. A subsequently read,
mutex-protected parent-controller authorization explicitly retains C018/S at the
new hash and declares unchanged scope/class/Admin/HEAD/whitespace guards and zero
additional authority or credit. Its 40 checks are parent-reported, not tests
executed by this worker. `publisher-boundary.json` links that actual record.
Only `capability\C018` is staged/committed, with `[C018][S]`, Copilot trailer,
annotated `kanban/C018/<12sha>`, atomic main/tag push and remote verification.
The owned ignored `publication.json` supplies the full Report to the parent;
this worker never Accepts itself.

**IaC: N/A.** No package/download, cloud resource, framework scaffold, Entra,
real-user data, credentials, deployment or spend. Approved production design
remains Node 24 / Express / App Service Linux / Azure Tables, Queues and Blob.
Educational AS-IS examples have no warranty, Microsoft endorsement or SLA.
