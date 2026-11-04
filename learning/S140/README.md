# S140 — Complete authorized export rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. A-S140 is one original frozen **S** unit,
parent D-S140, packet SC-S140, owner `worker-A-S140`. No server, package installation,
account, credentials, framework or deployment is required.

## Exact source and acceptance

- S140: **Asynchronous report/export:** Preserve job status and artifact access
  when processing and download reach different deployments.
- D-S140: Add asynchronous export submission, processing cutover, polling, and
  download. **Job state, final artifact bytes, authorization, and download access
  survive independent tier transitions.** Original dependencies: D-S039, D-S048,
  D-S044.
- A-S140: Submit, process, poll, and download an export across tiers; detect a lost
  artifact or authorization. SOURCE is its portable entry gate.

`evidence\source.json` and the selected raw snapshots retain the exact source rows,
portable contract and SC-S140 packet rule read before design. Full working-tree
bytes, including CRLF, and canonical Git bytes are retained **separately** as gzip
proof. Scoped `.gitattributes` disables text conversion only for raw evidence.
Delivered application/test text is explicitly normalized to LF before its final
seal. Read-only integrity compares raw and filtered Git object hashes, preventing
a clean checkout from silently invalidating worktree-only hashes. Earlier raw
CRLF RED, browser and correction snapshots remain unchanged.

## Exercise

Every request, job, poll, export, artifact, identity, state, tier, failure and timing
is **fixed fictional teaching DATA ONLY**. Actions transform immutable in-memory
records. No HTTP request, storage/queue operation, real download, authentication,
business/user-data operation or Azure operation occurs. “Download” means inspect
the final fictional byte array, not fetch or save a file.

Preconditions are one fixed export owner, one foreign identity, a nine-byte oracle,
explicit shared-state/authorization assumptions, and four separately named tiers.
Those assumptions are not proofs of actual durable storage or authorization.

1. Choose a condition, one of two fictional download identities, and an integer
   fictional budget from 1–100 ms (default 40).
2. Submit the fixed export on `submit-v1`.
3. Switch **processing** to `processor-v2`, then process the fictional job.
4. Switch **polling** to `poller-v2`, then poll. Check now: the displayed fictional
   HTTP 200 and completed job still leave the authorized download **unknown**.
5. Switch **download** to `download-v2`, then inspect its fictional final bytes.
6. Check the complete journey. Positive requires the same request/job/export,
   completed polled job, correct artifact binding, **every byte**, intended-owner
   allow, foreign-identity denial, download access, independent transitions and
   the complete declared budget.

Fixed step clocks are 5 + 1 + 12 + 1 + 4 + 1 + 6 = **30 fictional ms**. A budget of
30 passes that boundary; 29 detects a timing failure. These are summed fixture
clocks, not measured browser performance or Azure latency.

| Fixed condition | Measured complete-journey result |
| --- | --- |
| Preserved export, intended owner, budget ≥30 | Positive; all nine bytes and authorization/isolation match |
| Artifact lost on download v2 | Negative; completed job/poll cannot restore missing artifact access |
| Owner authorization lost | Negative; completed job does not permit an owner denied by download |
| Foreign identity allowed | Negative even with owner HTTP 200 and correct bytes |
| Same-length bytes changed | Negative even with HTTP 200 and the correct byte count |
| Job state lost on processing v2 | Negative; missing job/poll status is explicitly detected |
| Poll and download unobserved | Unknown; processing completion cannot invent client observations |
| Foreign requester in the preserved fixture | Negative; denial is correct, but the intended owner's journey did not finish |

A failed client journey may have a correct teaching verifier. Missing required
observations stay unknown; no status-only shortcut awards success. The retained
checklist states each pass/fail/unknown and the exact byte comparison count.

## Keyboard, errors, reset and limits

Use Tab/Shift+Tab, native select keys and Enter/Space. Focus advances to the next
ordered action. Invalid budget, unknown fixture/identity, extra or wrongly typed
commands, out-of-order actions and forged state are rejected without changing
state or history. Errors are live, visible and associated with invalid inputs.
The model replays bounded history to reject invented job/byte/identity records.

Reset restores default inputs, initial active tiers and selector focus, clears
errors, and **retains prior events and checks**. It never calls a shadowable
`form.reset`. Latest per-attempt counters avoid double-counting an early unknown
followed by a positive. A prior positive is not shown as a new active result.
Eight attempts and 96 events are hard limits; no history is silently discarded.
Reload starts an empty rehearsal; there is no persistent storage.

CSP denies network connections, forms, frames, objects, bases, inline scripts and
inline handlers. Only same-origin external script/style files are allowed.
Real-browser checks observe blocked inline probes and no non-file requests;
this is not an OS-level network-sandbox claim.

## Read-only verification

From the repository root in PowerShell, with capture **unset**:

```powershell
node --test --test-reporter=tap .\learning\S140\model.test.cjs .\learning\S140\integrity.test.cjs .\learning\S140\browser.test.cjs
node --check .\learning\S140\model.js
node --check .\learning\S140\lesson.js
node --check .\learning\S140\browser.test.cjs
node --check .\learning\S140\integrity.test.cjs
node --check .\learning\S140\record.cjs
node --check .\learning\S140\model.test.cjs
```

Normal tests read existing proof and exercise the actual DOM; they never rewrite
source or evidence. The published helper owns disposable, isolated test profiles.
Missing tooling is an error, not an install/download or a silent skip.

Use only published `testing\browser\isolated.cjs`, publication **53c0c0d**, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
with `openIsolatedLesson` and **awaited `finally` close**. Evidence is limited to
existing offline Playwright **1.56.1**, Microsoft-signed Edge **156.0.4314.50** and
Node **22.23.4**. It does not validate production Node 24, native Azure behavior,
source-parent completion or an unattended CI lifecycle. The known helper
lifecycle limitation and inactive, unqualified recovery prototype remain limits.
No security flags, packages, browser downloads or foreground/shared leases are used.

Only an intentional recapture enables exact `CAPTURE_BROWSER_EVIDENCE=1`:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node .\learning\S140\record.cjs browser }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

Do not use capture as verification. `record.cjs` is an explicitly invoked evidence
producer; its `source`, `red`, `iac-na`, `green`, `syntax`, `tooling`, `integrity`, `canonicalize`, `seal` and
`verify` actions also write scoped evidence. After an intentional source/capture
change, explicitly reseal; normal tests never repair a changed seal.
Raw snapshots/TAP/JSON, including any failed capture, stay outside test discovery
and are never overwritten. RED is a loaded stub with genuine behavioral
assertion failures, followed by explicit resource-free IaC N/A, implementation,
focused green/syntax/integrity and actual isolated DOM observations.

## Honest remaining To Do

`remainder.json` refines the existing **B-S140 / D-S140** native remainder. It needs
CORE, DATA, HOST, OBJECT and C025; an approved isolated export target, durable
job/artifact byte oracle, permission contract, independent transition plan and
separately authorized bounded lease. D-S039/D-S048/D-S044 acceptance is not inferred.

Only `learning\S140\**` is delivered. Parent-owned C005–C008/catalog/local-harness
integration is untouched. This lesson does not perform native work, edit a ledger
or complete D-S140. Parent alone may empirically accept A-S140 **once**; the worker
awards zero Done or extra test/repair/proof/refinement credits and stops after this
one original mission.
