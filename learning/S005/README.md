# S005 — Move one tenant

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. No build, server, dependencies,
credentials or cloud access are needed. This is A-S005 (S, parent D-S005,
packet LP-RINGS), not B-S005 or a completed native source demonstration.

## Worked exercise

1. Leave tenant **cedar** selected. Observe a request: source is actually sampled.
2. Attempt **Transfer ownership and route** before synchronizing. It must block;
   intended target is not an observed target request.
3. Synchronize cedar. The target receives one toy record, not a business write/job.
4. Transfer ownership and route. Cedar alone moves to target at fence 2. A route
   change is not a request observation; the earlier source sample remains dated.
5. Observe a request, apply one write, and run one background job. Target alone
   reports one write and one job. Birch and maple remain unchanged.
6. Replay the source worker's captured fence 1. It must block with no effects.
7. Reset. Synchronize, load the **unsafe dual-owner fixture**, then attempt a
   transfer, write or job. All must block. Reset is the recovery for that fixture.
8. Inspect the unsafe unrelated-route proposal. Its other-tenant drift is detected
   and rejected, **not applied**. Applied-state isolation stays intact.

To explore freshness, synchronize, apply a source write, then attempt a transfer.
The earlier copy is stale; synchronize again before transferring. You can select
birch or maple instead; every action is scoped to exactly one selected tenant.
All controls support Tab, Shift+Tab, Enter/Space and native select keyboard use.
Reset also restores selection, step 0, empty observations, effects and trace.

## Fixture and interpretation

`S005-fixture-v1` has three invented tenants. Source credits are 120/160/200,
revision 1; target credits/revision start at 0. A write adds 5 toy credits; a job
increments a toy fulfilled-job count. Both advance the owner's revision. A
synchronization copies data but never copies effect counters. The clock is an
integer synthetic action step, not elapsed time. The 80-step limit requires Reset.

The UI separates **intended destination**, **configured route**, **observed
synthetic request** (with its sample step/revision), and **effect deltas**. A blocked
attempt or handoff without a probe has no new observed destination. Old samples
are not silently relabeled. Negative experiments are safe aborts, not successful
uninterrupted migrations. The isolation check compares the complete unrelated
tenant snapshots, not only routes.

## Validation and genuine TDD

Using the repository's existing Node test tooling (observed Node 22.23.4):

```powershell
node --test --test-reporter=tap .\learning\S005\migration.test.cjs .\learning\S005\bundle.test.cjs
node --check .\learning\S005\migration.js
node --check .\learning\S005\lesson.js
```

`migration.feature` was written first. The loadable no-op model is preserved in
`evidence\migration.stub.cjs`; the actual initial run in `evidence\red.txt` has
1 passing fixture/load check and 36 behavioral failures (exit 1), not a missing
module or parser failure. To reproduce that red without replacing working code:

```powershell
$env:S005_MODEL = '.\learning\S005\evidence\migration.stub.cjs'
node --test --test-reporter=tap .\learning\S005\evidence\migration.initial-red.cjs
Remove-Item Env:\S005_MODEL
```

The later input-guard red is also preserved: 37/40 passing, three genuine failures
for inherited fields, symbol keys and nonenumerable extra keys, followed by exact
own-key validation. Current green is 48/48 (40 behavior + 8 bundle checks).
The `.txt.gz` red transcripts preserve the **exact original bytes**; hashes are in
`evidence\raw-tap-archives.json`. Their `.txt` presentation copies remove only
trailing spaces/tabs from Node's assertion diffs so the publication whitespace
gate can pass. No failure, diagnostic, count or outcome was manufactured.

The final green output, syntax results, and dedicated real-browser results are
referenced by `evidence.json`. Node assertions do **not** substitute for browser
keyboard, Reset, unsafe-path or unknown-input verification.
`evidence\worked-trace.json` is a deterministic nine-step model-generated example,
explicitly labeled as synthetic engine output rather than browser evidence.
`browser.check.cjs` exports a real-page verifier for provided browser tooling. It
imports no browser package, installs nothing, uses trusted keyboard events against
the actual page, and is **not** a Node DOM fixture or a standalone Node test pass.
The actual browser found a Reset/render ordering defect; its visible-page red and
the subsequent 43-assertion keyboard green are preserved separately. The green
includes 24 trusted submissions and six native Resets, not forced clicks or skips.

## IaC N/A and scoped limits

The post-red IaC step is **not applicable**: this is only local HTML, JavaScript
and CSS. No IaC, Azure resources, database, identity registration, management
call or expenditure is needed or authorized. Production runtime/auth design
approval does not grant those permissions.

The in-memory atomic transfer, fence and data copy are deliberately small teaching
models. They do not prove distributed consensus, database replication, transaction
isolation, durable state, real background execution, authentication, network
behavior, latency or availability. Reset/reload discards state. A restrictive CSP
blocks connections and form navigation. No arbitrary destinations or credentials
are accepted. Native B-S005 proof remains gated separately.

Sources: [S005](../../README.md#scenario-catalog),
[D-S005](../../.docs/wiki/backlog.md#a-deployment-and-traffic-migration),
[portable A contract](../../.docs/wiki/kanban.md#portable-a-card-lesson-contract).
