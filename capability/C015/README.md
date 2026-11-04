# C015 — actual local filesystem restart fixture

**Training rehearsal - synthetic data - not a live Azure result**

This original **D / P0 / H001 packet / C001 entry** implements actual persistence
of versioned synthetic run/epoch state, not an in-memory ledger. Parent acceptance
alone awards its single credit. H001/H004, queued workers, native/cloud durability
and production Node 24 remain incomplete.

## What runs

No dependencies or installation are needed: Node 22.23.4 tooling, Node built-ins,
and installed PowerShell 7 for the existing Windows state mutex. C001's pinned
guard and C002's typed/versioned envelope, validator, strict JSON parser and
synthetic fixture are imported unchanged. Their comparisons do not themselves
authorize a write: current **literal boolean true** C001 local consent and the
separately scoped literal C015 fixture approval are reread immediately before
every filesystem mutation. False, missing, string `"true"`, changed scope, and
unreadable consent fail visibly. Browser data never supplies consent.

```powershell
node capability\C015\cli.cjs read synthetic-run-001
node capability\C015\cli.cjs read synthetic-run-002
node --test --test-concurrency=1 capability\C015\tests\contract-guard.test.cjs capability\C015\tests\restart.test.cjs capability\C015\tests\storage.test.cjs capability\C015\tests\surface.test.cjs capability\C015\tests\integrity.test.cjs
node --test capability\C015\tests\browser.acceptance.cjs
node capability\C015\tests\verify.cjs focused
node capability\C015\tests\verify.cjs browser
node capability\C015\tests\verify.cjs syntax
```

Each CLI invocation is a fresh actual process. `read` opens and validates files
and returns all retained state/acknowledgment fields; it never initializes state.
The published demonstration retains immutable epochs under
`fixtures\synthetic-restart-v1`. `write RUN_ID EPOCH` is an explicit scoped
synthetic-only mutation, accepts only the two named IDs and epochs 1–3, and
requires the exact next epoch. It cannot reset or overwrite previous history.
Ordinary tests use unique `test-scratch\test-UUID` namespaces, not those retained
demonstration files. The test harness deletes only specifically tracked created
files and empty subdirectories, never category roots or recursive wildcards.

## Publication and recovery semantics

1. Validate closed synthetic state using C002 and current C001 consent.
2. Check owned paths, regular files, contiguous immutable history and next epoch.
3. Create an exclusive cooperative writer marker; never reclaim stale markers.
4. Write an exclusive same-directory staging file, flush its regular-file handle,
   close it, then rename to the new immutable epoch filename.
5. Flush the published regular file again, close it and reread/verify exact bytes.
6. Remove the writer marker only after that completed real write/flush/publication.
7. Return the matching acknowledgment. No acknowledgment precedes these steps.

A receipt describes completed local-file publication, **not proof that an
external client received stdout**. Abrupt child exits before acknowledgment leave
a marker/partial or unobserved publication; fresh readers report
`HOLD_UNOBSERVED`, never a success-shaped previous-state fallback. A crash after
marker removal but before stdout delivery is intrinsically ambiguous about
delivery; no exactly-once delivery or distributed transaction is promised.
Missing or corrupt files, history gaps, duplicate JSON, unsafe numeric literals,
wrong schema/types/IDs, extra fields, symlinks/junctions, hardlinks, stale epochs,
oversize state and storage errors reject or hold explicitly. There is no automatic
repair, silent default, migration, lease recovery or reinitialization API.

The envelope is **one cooperative writer per fixture on a local Windows regular
filesystem**, with the existing exclusive marker. Same-directory rename provides
atomic visibility as supported by that filesystem. Regular-file `fsync` is real;
directory-entry durability is not guaranteed on Windows. Power loss, disk/device
failure, malicious local writers/TOCTOU attacks, network filesystems, concurrency
across independent resources, distributed transactions and cloud durability are
outside this evidence. These are process-exit/restart tests, not power-cut tests.

## Browser and evidence

Open `index.html` directly. Tab/Enter inspect the bundled actual captured receipt;
the scope selector demonstrates explicit Azure denial. Clear display only
resets presentation and keyboard focus, never stored files. Unknown values reject.
The page makes no network request and has no filesystem, process, write/reset
endpoint, authentication service, Entra integration or storage SDK. CSP denies
connections, inline scripts, forms, workers and frames.

The UI labels its data **bundled historical observation, not a live disk read or
fresh restart**; no prediction is used as persistence proof. Fresh-process CLI
evidence and signed Edge DOM/keyboard/CSP evidence are distinct. Node assertions
do not count as browser observations.

BDD is in `C015.feature`. Immutable `evidence\` retains the loadable-stub genuine
RED, failed attempts, actual filesystem receipts, focused tests and actual browser
capture. Normal verification is read-only for source, retained fixtures and
evidence. Only exact `CAPTURE_BROWSER_EVIDENCE=1` deliberately creates **unique**
raw capture files; it never refreshes an existing report or source snapshot.
Raw CRLF reports and Git-canonical contract bytes are pinned separately.
Scoped raw-file whitespace attributes preserve CRLF and the intentional padding
in raw TAP failure logs during Git's normal check. Source whitespace checks and
repository-wide settings are unchanged; raw evidence is never rewritten.
`evidence-index.json` names the distinct raw proof and preserves both failed
attempts. The `verify.cjs` entry point checks every owned source/evidence file
before and after execution, requires empty scratch afterwards, and never captures.

Publication uses the **parent-approved standard**
`.git\kanban-orchestrator\publish.ps1`, pinned by `publisher-boundary.json`.
The explicit same-task parent update added C015's frozen D to the closed allowlist
and requires HEAD equal remote main under the existing publisher mutex **before
staging**. The standard publisher commits only C015 with the Copilot trailer,
creates a real annotated `kanban/C015/<12sha>` tag, pushes main/tag atomically,
and verifies remote ancestry. No shared guard is edited or bypassed.
The former owned adapter was retained as an inert raw snapshot and its executable
removed. Historical evidence is not rewritten. The owned ignored
`publication.json` supplies the exact full standard publication to
`state.ps1 -Action Report`; only the parent accepts.

The subsequent parent-approved `91c8cf83…` revision changes only command-local
Git whitespace validation: preserved CRLF is accepted while real trailing spaces,
tabs, space-before-tab and blank EOF remain checked. The parent's 14 fixture/raw
checks are recorded as parent-reported evidence, not claimed as independently
executed here. The prior approved `815a1f0c…` bytes, exact-pin rejection, prior
boundary and full `2402a711…` publication receipt remain archived. This is a
same-C015 zero-extra-credit correction, not new infrastructure or permission.

IaC is **N/A**. This specifically approved local fixture does not replace planned
**Node 24 / Express / App Service Linux / Azure Tables/Queues/Blob** production
architecture. No real-user data, cloud services, credentials, provisioning,
deployment, identity registration, packages/downloads or spending are involved.
Educational AS-IS use does not imply a Microsoft SLA or endorsement.
