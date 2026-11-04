# C016 — actual local idempotent, epoch-conditional retries

**Training rehearsal - synthetic data - not a live Azure result**

Original **D / P0 / H004**, parents **H004/H012**, entry gate independently accepted
**C015 Done** (`78341b3370d7764b7f9c3eacc1796892dbc4f40f`). Only the parent accepts
one original D. Tests, repairs and refinements earn zero additional credits.

## Conduct and inspect

```powershell
node capability\C016\cli.cjs conduct retry
node capability\C016\cli.cjs conduct unknown
node capability\C016\cli.cjs conduct conflict
node capability\C016\cli.cjs conduct hold
node capability\C016\cli.cjs conduct duplicates
node capability\C016\cli.cjs inspect
node capability\C016\tests\verify.cjs focused
node capability\C016\tests\verify.cjs integrity
node capability\C016\tests\verify.cjs syntax
node capability\C016\tests\verify.cjs browser
```

`conduct` is a bounded usable Node component, not just a verifier. Every attempt
runs in a fresh actual child process and returns original stdout/stderr, exact
command identity, outcome, errors, permitted recovery and local file observations.
Each invocation creates **fresh unique C015 test-UUID namespaces** through C015's
unchanged test-scratch helper. Cleanup removes only its tracked exact created
files and empty child directories; it never deletes a category root, wildcard
tree, retained demonstration or sibling scratch. Abrupt parent termination may
leave owned scratch for explicit review; it is not automatically reclaimed.
An existing generated UUID or missing/non-directory accepted test category rejects
before IO; the component never initializes a shared category root.

Open `index.html` directly. Tab/Enter conduct a recorded attempt, inspect its
typed/replayed guarded journal, or replay a recorded identical retry. Unknown
original acknowledgment remains unknown after a positive retry. Selection changes
clear stale display; reset clears presentation and returns focus to the selector.
Scope escalation, unknown selections and unavailable dependencies fail visibly.
**Browser data is bundled historical observation, not an actual disk operation,
live consent read, command execution or fresh-process proof.** There is no write
or HTTP endpoint. The historical file count is captured evidence, not a counter
advanced by a button. CSP denies connections, inline scripts, forms and workers.

## Admission, identity and outcomes

`commands.d.ts` declares the closed command API. `makeCommand` reuses unchanged
C015 `contract.makeState`, two closed run IDs and epochs 1–3. Submit expects epoch
0; advance expects 1; finish expects 2. Stable declared identity is SHA-256 of
run, expected epoch and the exact validated synthetic payload; visitors cannot
supply IDs, arbitrary user data or alternate payloads.
The closed input is copied synchronously before any asynchronous consent/validation
step. Mutating the caller's object cannot redirect a pending command or separate
its declared identity from the payload actually published.

`execute` admits only a caller-owned fresh C015 test UUID, never the retained demo.
It validates through unchanged C015/C002 contracts and delegates **all actual
persistence** to unchanged `store.persist(namespace, candidate)` and all outcome
confirmation to `store.restore(namespace, runId)`. The callee rereads current
mutex-protected **literal boolean true C001 consent and exact scoped literal true
C015 fixture consent before every filesystem mutation**, including fixture cleanup.
Browser comparisons cannot grant this consent.

- **Positive / published:** actual C015 next-epoch publication and matching
  returned receipt, after its real regular-file flush/publication/verification.
- **Positive / idempotent-confirmed:** actual restore observes the matching target.
  An identical retry does not republish. Latest target returns its existing matching
  acknowledgment; older target returns verified history identity/digest **without
  inventing an older receipt**, since the C015 public API exposes only the latest.
- **Negative:** invalid/different payload, unknown fields/IDs/epochs, retained
  namespace or conflicting expected epoch cannot advance. Recovery means correct
  the closed command or inspect and explicitly declare the valid next command.
- **Unknown:** remaining writer marker, pending publication, corrupt/unreadable
  state, or unreceived stdout has no acknowledgment or success-shaped old-state
  fallback. A post-write error stays unknown unless a separate valid restore
  actually confirms the matching target. Markers require explicit operator review;
  neither commands nor retries reclaim them.

The journal retains immutable individual original process attempts and raw
stdout/stderr. It derives observed epochs from validated actual observations,
never a browser increment. **Verifier pass is not user success:** an original
failed/unobserved acknowledgment remains unknown even after a later positive retry.
Eight attempts per replay is an explicit presentation safety bound.
The journal checks all six factory-derived command/payload identities, matching
receipts, complete contiguous restored history and original failure streams;
coherently changed IDs or success-shaped unknown records are rejected.

## Cooperative concurrency boundary

Concurrent duplicate processes have **one intended local immutable epoch/effect**;
the winner has one actual publication receipt. A loser reports known conflict or
unknown until a real matching restore confirms it. C015's existing cooperative
single-writer marker is unchanged. Directory/marker races or unobserved publication
can leave a marker and therefore unknown outcomes even when an epoch file exists.
There is no general multi-resource compare-and-swap, automatic retry loop, unsafe
lock reclamation, new persistence engine, schema change or extra event store.

This is proof about synthetic immutable local filesystem effects, **not external
business exactly-once, exactly-once client delivery, distributed transactions or
cloud durability**. C015 regular-file fsync is real; Windows directory-entry and
power-loss durability are not guaranteed. Malicious writers/TOCTOU, network filesystems,
power/device failures and cross-resource concurrency remain outside the envelope.

## Evidence and publication

BDD → loadable stub → genuine behavior-assertion RED → **IaC N/A** →
implementation/refactoring → focused fresh-process/conditional/dedup/error/byte
integrity/syntax GREEN → actual signed Edge DOM/keyboard/error/reset/unknown/CSP.
`evidence-index.json` names exact raw evidence and preserves setup/test failures.
Raw CRLF evidence and Git-canonical dependency bytes are pinned separately.
Scoped raw TAP attributes retain genuine failure padding; no shared Git setting
or raw report is rewritten.

Normal verification is **source/evidence read-only**, including accepted C001/C002/
C015 and retained demo. Only explicit new owned test fixtures perform IO and are
cleaned exactly. Exact `CAPTURE_BROWSER_EVIDENCE=1` is the deliberate append-only
browser capture path: one unique raw proof, no refresh/overwrite. Offline testing
uses approved Node **22.23.4**, Playwright **1.56.1**, signed Edge **156.0.4314.50**
and unchanged pinned `testing\browser\isolated.cjs`; every session closes in finally.
Their known lifecycle limitation is not disguised as unattended CI qualification.

`publisher-boundary.json` seals the **historical F6 source used for original
`2dd11993…`**, not a forever-current private file. Normal historical tests read
the existing approved source snapshot, validate its original approval, and remove
only the historically authorized `C034=S` token to reproduce `48846487…`.
Future explicit parent admissions do not invalidate that immutable proof.

For an actual next transaction, `tests\publisher-wrapper.ps1` reads fresh
mutex-protected canonical `localPublisherAuthorization`, verifies the exact
original C016 D/worker/scope, closes state handles, and acquires the publisher
mutex. It rechecks actual source bytes against current explicit approval immediately
before delegating to the **unchanged standard publisher**. No historical digest or
current-at-capture snapshot authorizes a future transaction. Unknown source, scope,
owner/class/path/Admin overrides, or main/remote mismatch reject before staging.
Lock order is **STATE read/validate/release, then PUBLISHER**. The held publisher
section uses only that copied validated authority/scope and actual byte/Git
rechecks. It never calls a state reader, including indirect Node/PowerShell readers.
If a refresh is needed, the publisher is released before a fresh ordered attempt.
An isolated two-process named-mutex regression derives the real wrapper call
schedule from its PowerShell AST; it uses no shared mutexes, production overrides
or Git writes. Its genuine old-order RED and corrected GREEN remain separate.
The C048/C019 separation pattern is reused read-only; no storage/runtime engine
or shared guard is modified.

Publication still requires owned paths only, main already equal remote before
staging, Copilot trailer, annotated `kanban/C016/<12sha>`, atomic main+tag push and
remote peel/ancestry.
The owned ignored `publication.json` reports the full result through the existing
state controller. The worker never accepts itself or edits the shared ledger.

The task-original private publisher SHA `48846487…` drifted during execution;
its genuine exact-pin failure remains in the first focused raw report. The
mutex-protected parent controller already approved successor `f6df80bd…` for
the sole added `C034=S` class. Independent read-only byte comparison removes
that single token and reproduces **exactly** the original approved SHA: C016's
D/path/Admin/main/remote/whitespace guards are unchanged. The actual approval,
current source bytes and original owned boundary snapshot are retained; the
parent's 40 guard checks are explicitly parent-reported, not claimed as C016 runs.
No private publisher was edited, copied for execution, patched or bypassed.
The parent’s subsequent `C016-parent-focused-170.tap` failure is retained exactly
under `evidence\parent-provenance-review-a3a2b0d7-c737-458d-b0c4-dd573d3f94ac.*`,
alongside the old qualified `2dd…` report. It exposed an erroneous live-F6 check,
not a lost local acknowledgment or runtime failure. The provenance-only correction
preserves that failure and every original source/evidence/RED byte snapshot.

The prior unpublished/quarantined result is retained byte-for-byte in
`evidence\blocked-report-cc35608d-d45e-47ed-8461-3011e0f5f9b8.snapshot`.
The parent restored this same original card and worker after qualifying shared
main; no Register, Claim, new unit or additional credit was inferred from a peer.
Every new publication still checks current main against the actual remote under
the unchanged standard publisher mutex.

**H004/H012/native/production Node 24 remain incomplete.** Planned Node 24 /
Express / App Service Linux / Azure Tables/Queues/Blob architecture is unchanged.
No cloud/IaC/scaffold/identity/deployment/packages/downloads, real-user data,
credentials or spending. Educational AS-IS use does not imply a Microsoft SLA
or endorsement.
