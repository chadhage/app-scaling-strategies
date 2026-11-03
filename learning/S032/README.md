# S032 — Slot-routing cookie transition

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, sign-in or Azure subscription is needed.
This bundle implements **A-S032**, one frozen **S** unit in **SC-S032**, traced to
README S032 and backlog D-S032. S031 is a separate accepted lesson and is unchanged.

## Worked exercise

1. Leave nominal green allocation at **100** and choose **Replay cohort**.
   The trace shows two blue-pinned clients still at blue and two at green:
   **0 / 2 originally blue-pinned clients migrated**. Completed blue requests are not migration.
2. Choose **Attempt blue retirement**. The safety guard retains blue and reports its blockers;
   this is not a successful migration or a user interruption.
3. Reassign `pinned-a` to green with **Complete**, then `pinned-b` with **Complete**.
   The green-c client and unpinned new-d never count as blue-pinned migrations.
4. With fresh complete green evidence for all four clients and nominal 100%, retirement becomes
   ready. Attempt retirement: blue becomes retired and only reset remains operable.
5. Archive and reset. Replay again, then reassign with **Interrupted** or **Unknown**.
   Inspect the cookie target separately from the reply destination. Replay recovers the *current*
   observation; cumulative impact and every earlier failed/missing attempt remain intact.
6. Applying allocation starts another routing epoch, even at the same percentage.
   Stale green evidence cannot permit retirement: collect a fresh cohort replay.

The fixture has four clients, abstract slot pins and deterministic unpinned bucket 75.
A pin overrides the percentage; new-d chooses green only when `75 < greenPercent`.
This is **slot routing**, not ARR/worker affinity, real cookie manipulation or S031 session storage.
Both synthetic slots are assumed healthy and compatible. No real response or live user is sampled.

## Honest outcomes and bounds

- **Success:** all four clients currently have fresh completed green observations, allocation is
  100%, and no attempt in the run was interrupted or unknown.
- **Failure:** at least one request was interrupted (synthetic 503), even after recovery.
- **Unknown:** a reply was missing or current migration evidence is incomplete/stale.
- **Retirement:** independently blocked, ready or retired. Guard success is not user-transition success.

Strict exact schemas reject extra/missing fields, non-integer/out-of-range percentages, unsupported
clients/replies, malformed or impossible state, and reassignment without current-epoch inspection.
Terminal retirement prevents further actions. Each run has at most **24 actions**. Reset retains
the complete trace of the last **three** nonempty runs and counts older evictions; empty reset is
idempotent. There are at most **1000 runs** per page lifetime. History is memory-only and is lost
on reload/close. No real cookies or browser storage are accessed.

Native selects/buttons, explicit labels, visible focus, live results, focused errors, a skip link
and keyboard reset are supported. Reset calls the unshadowed `form.reset()` and returns focus to
allocation. CSP permits only local external scripts/styles and blocks inline script/handlers,
connections, workers, frames, objects and form submission.

## Focused verification

From the repository root, using the existing **Node 22.23.4** tooling:

```powershell
node .\learning\S032\verify.cjs all
```

Or select `green`, `syntax`, `browser` or `integrity`. Ordinary verification checks the bytes of
retained proof before and after the run, and writes **no proof files**. Test discovery does not
execute historical `.snapshot.txt` RED fixtures.

Evidence refresh is deliberate only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S032\verify.cjs all
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture appends numbered raw stdout/stderr and source-hashed records; earlier observations are
never overwritten. The one-time `red` stage was run against a loadable stub before implementation:
one test passed and **seven failed with ERR_ASSERTION**, not missing code, packages or tools.
The exact BDD, stub and test snapshots and raw outputs are retained under `evidence`.
An explicit resource-free IaC N/A was recorded after RED and before implementation.

Browser tests exclusively use published `testing\browser\isolated.cjs` from `53c0c0d`,
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, and awaited `close()` in `finally`. The offline pairing is pinned
Playwright **1.56.1** with installed Microsoft-signed **Edge 156**. No downloads, unsafe flags,
foreground leases or abandoned lifecycle prototype are used. The published helper's known
unattended lifecycle limitation remains; this lesson does not qualify or repair that tooling.

## Remaining source scope / To Do refinement

A-S032 has one implementation/verification/publication unit; parent empirical acceptance is
pending. No separate test, plumbing or refinement unit is created, and no unrelated To Do pruning
is justified by this lesson.

**B-S032 remains unready:** CORE, DATA, ASANY, C108, a qualified native target, original P001 and
BASE (H011, P005, HOST), real cookie reassignment/destination evidence and native retirement
dependencies, plus separate cloud/IaC/identity/deployment/spend approvals. This local lesson
cannot complete D-S032, certify production Node.js 24, establish native platform support or
prove five-nines reliability. Cookie policy/expiry, real sessions/authentication, drain and
in-flight work are outside this bounded fixture.

The demonstration is provided **AS IS**, without warranty. It is not a Microsoft SLA.
See the repository's [Microsoft Open Source Disclaimer](../../README.md#microsoft-open-source-disclaimer).
