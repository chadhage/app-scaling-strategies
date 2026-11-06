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

## U019: an owned amendment path for the pinned C015 test bytes (zero credit, publishes under C016 / D)

**Training rehearsal - synthetic data - not a live Azure result**

U019 unblocks K-C015. `dependency-pins.json` pins the raw CRLF and the Git canonical bytes of the 160 accepted C001, C002 and C015 files, so the one
permitted K-C015 edit of C015 `tests\surface.test.cjs` (line 70, 6034 bytes become 6036) fails this namespace's integrity test (expected 6034 bytes, found 6036).
`dependency-pins.json` is never rewritten: it stays the immutable history. A chained, append-only addendum `dependency-pins-addendum-N.json` is the current
authority. U019 adds tests, tooling, evidence and this section only: no production source, sealed evidence or retained RED changes. Coverage is
not-applicable for the card (test-only change); the two new helpers are measured anyway (see Coverage).

| Path (under `capability\C016`) | Kind | Purpose |
| --- | --- | --- |
| `C016-pin-amendment.feature` | new | Behavior specification, written before the RED |
| `dependency-pins-addendum-1.json` | new | Addendum 1, written once with flag `wx` by `tests\seal-pin-addendum.cjs`: authorizes the exact K-C015 replacement of `surface.test.cjs` |
| `tests\pin-authority.cjs` | new test tooling | Pure checker with injected pins, addenda and bytes: `listAddenda`, `resolveChain`, `acceptedRecords`, `checkRaw` |
| `tests\surface-edit.cjs` | new test tooling | The one-line K-C015 edit as exact CRLF bytes (`applySurfaceEdit`) |
| `tests\pin-amendment.test.cjs` | new test | 16 specification tests: 13 on synthetic pins, 2 on the real pins and Git history, 1 guard of the integrity test source |
| `tests\pin-amendment-replay.cjs` | new test tooling | Replays the RED, the stub RED and the K-C015 simulation in a scratch copy outside the repository |
| `tests\seal-pin-addendum.cjs` | new test tooling | One-shot writer of addendum 1 (refuses to overwrite) |
| `tests\integrity.test.cjs` | edited | Only the first test: its raw byte check calls the checker, and `TRUSTED_ADDENDA` pins addendum 1 by LF hash. The 160 records, the Git canonical proof at `observedHead` and the other eleven tests are unchanged |
| `tests\verify.cjs` | edited | `focused` also runs `pin-amendment.test.cjs` |
| `evidence\u019-pin-amendment\` | new evidence | Retained v1 integrity test, the loadable stub, RED-01 and RED-02 manifests with raw gzip streams, `* -text` attributes |

### Rules the checker enforces

- Addenda are `dependency-pins-addendum-<n>.json` in the namespace root, numbered consecutively from 1, closed key sets, schema `C016-dependency-pins-addendum/1`.
  Addendum 1 names `base` (`dependency-pins.json` and its LF hash); every later addendum names `previous` (name and LF hash of the addendum before it).
  Links use the LF-canonical hash, so the chain also holds in a CRLF checkout. Near-miss file names, gaps and directories named like an addendum are rejected.
- Only a pinned C015 test file (`capability\C015\tests\<name>`, the 13 pinned files) can be superseded. A C015 production file, any C001 or C002 file, an unpinned
  file or any other path is rejected with `AMENDMENT_PATH_NOT_ALLOWED`, with or without an addendum.
- Each step names the exact record it supersedes (raw size, SHA-256, CRLF count: it must equal the current head of that file, so sealed bytes cannot be superseded
  twice) and the exact replacing record (raw size, SHA-256, CRLF count, Git canonical size and SHA-256). No-op and duplicate steps are rejected.
- `authorized`: the file may hold the superseded bytes or exactly the replaced bytes (the edit is made after the addendum is published). `applied`: only the
  replaced bytes. Once a later addendum supersedes a state it is no longer accepted. An authorized step stays open until a later addendum supersedes its bytes
  (a replacement equal to the superseded bytes is a rejected no-op, so there is no promotion step).
- Any other byte change is rejected naming the path, the accepted hashes and the actual hash. A replaced record must describe its bytes: size, CRLF count and an LF
  form equal to the recorded Git canonical size and SHA-256.
- The integrity test pins the published addenda in `TRUSTED_ADDENDA` by LF hash (a later edit of addendum 1 is rejected; addendum 2 only has to link to it) and still
  compares the canonical bytes at `observedHead` for all 160 sealed records.

### The pre-authorized K-C015 edit (addendum 1, `authorized`)

Line 70 of C015 `tests\surface.test.cjs` (6034 bytes, `89834f62ff4ba274de01d95d8b470818482e5cfb4896b339dbd1916907d0c480`; `K-C015.md` says line 68, which is the test
title) keeps its CRLF ending and its indent and replaces `path.resolve(root, '..', '..', boundary.standardPublisher)` by `path.join(root, 'evidence', boundary.approvedSourceSnapshot)`
(6036 bytes, `a8deb9cc0e252974c4c46b2bbe09edf3491523521b2ff931427cc174c79cab9e`, 100 CRLF; Git canonical 5936 bytes `b0c38e824a67946a7b8c2bbc1e81fd9d06500c64e0633d29138a08222afb4c3f`):

```js
  const bytes = fs.readFileSync(path.join(root, 'evidence', boundary.approvedSourceSnapshot));
```

`applySurfaceEdit` in `tests\surface-edit.cjs` produces exactly these bytes, and `pin-amendment.test.cjs` rebuilds them from `git show dcf698aa876bcea99a981480f0e688f44197a66f:capability/C015/tests/surface.test.cjs`
(LF), the one-line replacement and the CRLF conversion; exactly line 70 differs. Any other layout, an LF ending or any other edit of any of the 13 files is rejected.

### Commands (repository root, PowerShell 7, Node 22)

RED replays. Each takes a NEW scratch directory outside the repository, builds a copy of C001, C002, C015 and C016 there, reads Git history through `GIT_DIR` and removes the copy.
Use a SHORT path (at most 122 characters): Windows `git show <rev>:<path>` stats `<cwd>\<rev>:<path>` and the longest pinned name is 136 characters; the script refuses longer paths.
Exit 0 means the RED reproduced. Archives written once with `--archive`: `evidence\u019-pin-amendment\red-01-edit-without-amendment.json` (control exit 0, edited exit 1,
`expected: 6034`, `actual: 6036`) and `red-02-spec-against-stub.json` (exit 1: 15 of the 16 specification tests fail by assertion, 1 passes).

```powershell
node capability\C016\tests\pin-amendment-replay.cjs red <short-fresh-dir>\r     # retained v1 integrity test + the K-C015 edit: fails at the raw byte check
node capability\C016\tests\pin-amendment-replay.cjs stub <short-fresh-dir>\s    # the specification tests against the retained loadable stub
```

GREEN.

```powershell
node --test --test-concurrency=1 capability\C016\tests\pin-amendment.test.cjs capability\C016\tests\integrity.test.cjs   # 28 tests
node capability\C016\tests\pin-amendment-replay.cjs green <short-fresh-dir>\g   # K-C015 edit applied in a scratch copy: integrity, specification and the C015 surface test (33 tests)
node capability\C016\tests\verify.cjs focused      # whole non-browser suite: 41 tests
node capability\C016\tests\verify.cjs integrity    # 12 tests
node capability\C016\tests\verify.cjs syntax       # 26 script files and 2 PowerShell files
```

Coverage: not-applicable for the card (test-only: every added or changed file is under `tests\`, `evidence\` or a document; `git status --porcelain -- capability/C016` shows the new files
above plus `README.md`, `tests\integrity.test.cjs` and `tests\verify.cjs` as the only modified paths). The helpers are measured anyway, per file, exit 0 (heavy slot):

```powershell
foreach ($f in 'pin-authority','surface-edit') { node --test --test-concurrency=1 --experimental-test-coverage "--test-coverage-include=capability/C016/tests/$f.cjs" --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 capability\C016\tests\pin-amendment.test.cjs capability\C016\tests\integrity.test.cjs }
```

Measured (lines / branches / functions): `pin-authority.cjs` 100 / 100 / 100, `surface-edit.cjs` 100 / 100 / 100.

Consumers (after this change, real tree, all green): C018 `verify.cjs focused` 21/21, C019 `verify.cjs focused` 100/100. After the K-C015 edit, in a scratch copy of C001, C002, C015, C016, C018 and C019
(edit applied there only, real C015 untouched): C016 `verify.cjs focused` 41/41, C018 21/21, C019 100/100, C015 own focused suite 32/32. No other namespace compares live C015 test bytes
(C018 pins only top-level C015 files; C019 hashes before and after a run).

Browser: this item changes no page, runtime or production file. The unchanged C016 real-browser suite (`node capability\C016\tests\verify.cjs browser`, heavy slot, no capture) still fails before it opens
the page, for a reason that predates U019: its sealed `tests\browser.acceptance.cjs:26` pins Edge `156.0.4314.50` and the installed Microsoft-signed Edge auto-updated to `156.0.4314.58` (`expected` versus `actual`
in the TAP). It left no evidence rewrite (`ownedFilesUnchanged` 171). A fresh isolated headless Edge observation of the unchanged page through the approved helper (heavy slot, closed in `finally`) succeeded:
Edge `156.0.4314.58`, title `C016 — conditional local command retries`, the training banner and the H004/H012 incomplete statement present, 4 buttons:

```powershell
node -e "const { openIsolatedLesson } = require('.\\testing\\browser\\isolated.cjs'); openIsolatedLesson('capability\\C016\\index.html').then(async (s) => { try { console.log(s.browserVersion, await s.page.title()); } finally { await s.close(); } }).catch((e) => { console.error(e); process.exitCode = 1; })"
```

Whitespace (quote the whole `core.whitespace` argument):

```powershell
git -c "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol" diff --check -- capability/C016
```

### Traps

- Never rewrite `dependency-pins.json` or a committed addendum; append `dependency-pins-addendum-<n+1>.json` that names the bytes the previous one produced. Never edit C015 from here: K-C015 applies its own edit.
- The K-C015 agent restores or edits `surface.test.cjs` with exact byte copies only (`Copy-Item`), never `git restore` (`eol=lf` writes LF and the pinned raw bytes are CRLF).
- `verify.cjs` hashes the whole C001, C002 and C015 trees before and after a run and C016 itself: do not add files there while a C016 verifier runs.
- This namespace's `.gitattributes` makes `*.cjs`, `*.md` and `*.json` `eol=lf`; working `.cjs` and `.md` files are CRLF (create and edit tools), scripts write JSON with LF, and the evidence copies under `u019-pin-amendment` are `-text` raw bytes.
