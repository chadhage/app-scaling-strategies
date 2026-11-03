# Demo Harness Kanban

## Purpose and current state

Decompose all 171 parents in [backlog.md](backlog.md) into independently owned, testable delivery slices. The inventory below is the source contract; the [live execution ledger](flow-state.json) records admitted work, owners, empirical acceptance, published commits/tags, blockers, and actual Kano totals. Planning inventory is not implementation evidence.

The inventory contains **414 cards**:

- 108 capability and guided-workflow cards, C001-C108.
- 150 portable learning cards, A-S001 through A-S150.
- 150 native-proof cards, B-S001 through B-S150.
- 6 optional delighters, X001-X006.

Planned Kano mix: **28 dissatisfiers, 380 satisfiers, 6 delighters**. These inventory numbers do not earn completion credit. Done and reservations started at zero; consult the [live execution ledger](flow-state.json) for current totals.

The selected policy is **cumulative completion totals**, with each delighter's satisfiers completed in the **same named delivery packet**. No calendar sprint or simultaneous wall-clock completion is required.

Accepted checkpoint, 2026-11-03: **6 satisfiers Done, 0 dissatisfiers, 0 delighters**. The six portable lessons passed 282 independently rerun automated checks plus recorded real-browser checks, and their implementation commits and annotated tags are published on `main`. These are synthetic learning deliverables, not native Azure proof or completed source-demo parents.

The operator subsequently approved C001 design and local implementation: portable HTML/JS lessons, a proposed Node.js 24 LTS/Express control API on App Service Linux, single-tenant Microsoft Entra ID with invited guests, Azure Storage Tables/Queues/Blob for control state, App Service code slots as the first planned native target, and Bicep as the preferred future IaC format. Node.js 22.23.4 remains test tooling. **No IaC generation, identity registration, live Azure execution, deployment, or expenditure is approved.** Exact target/SKU/region and separate scaffold/deployment approvals remain required.

## TOC

- [Three-column board](#three-column-board)
- [Kano value and completion policy](#kano-value-and-completion-policy)
- [Atomic card contract](#atomic-card-contract)
- [Concurrent pull and one-piece flow](#concurrent-pull-and-one-piece-flow)
- [Entry gates and independence](#entry-gates-and-independence)
- [Capability and workflow cards](#capability-and-workflow-cards)
- [Scenario cards](#scenario-cards)
- [Optional delighters and tandem packets](#optional-delighters-and-tandem-packets)
- [Parent completion and traceability](#parent-completion-and-traceability)
- [Operating checks](#operating-checks)

## Three-column board

| To Do | In Progress | Done |
| --- | --- | --- |
| C001 is approved for its local contract/guard implementation. Next ready lessons: A-S031, A-S041, A-S004, A-S005, A-S007; see [live state](flow-state.json). | Current claims, owners, and empirical review are recorded in the live ledger; native work remains gated. | [A-S001](../../learning/S001/index.html), [A-S002](../../learning/S002/index.html), [A-S003](../../learning/S003/index.html), [A-S006](../../learning/S006/index.html), [A-S008](../../learning/S008/index.html), [A-S021](../../learning/S021/index.html). Evidence and publication references are in the live ledger. |

Let N be the number of active contributors:

- To Do limit: **2 x N** cards; admit only as many seed cards as fit.
- In Progress limit: **N** cards, with **one active card per contributor**.
- Review, tests, integration, and acceptance remain inside In Progress; there is no separate testing/review queue.
- Pairing or swarming consumes the participating contributors' capacity on the same card.

The tables below are an **unadmitted inventory**, not another workflow column and not a giant To Do queue. Returned remainders or approval-blocked cards may remain in the To Do bucket with `readiness=false` and a concrete blocker; they still count against its admitted queue limit. Only ready admitted cards with reserved quota/capacity are pullable, and global dispatch pauses take precedence.

All 150 A cards can start from the supplied source and the portable lesson contract below. Native B cards genuinely need a safe harness, fixtures, and a qualified target. Pretending those dependencies do not exist would not create independent work.

## Kano value and completion policy

### Classification

| Class | Meaning for this product | Examples |
| --- | --- | --- |
| D: Dissatisfier | A must-be expectation; absence makes the harness unsafe, misleading, or unusable. | Authorization, isolation, bounded spending, honest results, recoverable cleanup, accessible core controls. |
| S: Satisfier | A performance/learning benefit whose useful coverage, clarity, or control increases satisfaction. | Conduct another strategy, inspect real routing, practice a failure, compare capacity, understand an actual result. |
| L: Delighter | A useful, unexpected enhancement beyond the required conducting experience. | Time-travel replay, cross-run comparison, synchronized twin-client presentation. |

These are product hypotheses to validate with interested parties, not claims that a Kano survey has already been conducted. Kano class is not engineering priority. Freeze the class before admission; do not relabel work to bypass quotas.

Tests, formatting, refactoring, build plumbing, and approval administration are part of the owning card's Done criteria, not extra satisfier credits. Each card earns at most one credit even when it fulfills several backlog parents.

### Actual Done constraints

Let d, s, and l be the numbers of accepted Done cards in each class:

```text
s + l >= 4 * d
s     >= 6 * l
```

For every named packet p containing a delighter:

```text
s_p >= 6 * l_p
```

Each packet below names six distinct satisfiers for one delighter. A satisfier belongs to only one packet. As selected, the same accepted satisfier may also contribute to the cumulative D rule; no separate D companion allocation is required.

### Atomic admission and completion

Reserve quota when a card enters To Do, not after it has consumed engineering effort. Let rd and rl count admitted D/L cards in To Do or In Progress, and rlp the admitted delighters in packet p.

```text
Admit S: readiness and queue capacity are available.

Admit D only if:
    s + l >= 4 * (d + rd + 1)

Admit L only if:
    s >= 6 * (l + rl + 1)
    s_p >= 6 * (l_p + rlp + 1)
    all six designated companion cards are Done in packet p
```

Admission, reservation, pull, and completion update one versioned ledger transactionally. Two concurrent workers cannot reserve the same remaining quota. Future satisfiers and in-progress delighters are never borrowed as Done credit.

On D/L completion, release its reservation and increment its Done counter atomically. S completion increments s and its packet counter. Withdrawal releases the reservation without awarding credit. The six companions must complete before their delighter is admitted, so finished delighter work does not wait in a disguised completion batch.

Packets group evidence, not execution: satisfiers finish and ship individually; nobody waits for a six-card batch to move to Done. A packet closes after its delighter finishes.

Example: four S cards permit one D reservation. A second D is rejected until enough additional Done value exists. Six S cards permit one L only when the six designated companions are in that L's packet; six unrelated global satisfiers are insufficient.

There are 150 independently actionable learning satisfiers and only 28 planned D cards: the basic capabilities can be funded without relying on unsafe live execution or optional delights. Live features remain disabled until their must-be guards pass; safety is never waived to satisfy a quota.

## Atomic card contract

Every listed row is one card, one accountable owner/pair, one independently reviewable changeset, and one observable acceptance result. Normal publication is a scoped, labeled commit with an annotated tag on `main`; temporary recovery branches and reviewer-assisted PRs are used only when safe integration requires them.

Implementation order is BDD specification, genuine behavioral TDD red, the IaC step (or an explicit N/A for a resource-free lesson), implementation/refactoring, green tests and actual browser checks, scoped tagged publication, and parent-owned empirical acceptance. A worker cannot award its own Done credit. Subdivision preserves the original `kanoUnit`; partial work does not manufacture extra value.

- **Size target:** A cards take 1-2 focused hours; C, B, and X cards target 2-4 focused hours after entry gates are satisfied. These are slicing limits, not delivery estimates.
- **Refine before admission:** If a card needs a new research decision, multiple independent behaviors, or more than four focused hours, split it before pulling. Revalidate coverage and Kano classes; artificial splits do not manufacture extra value.
- **Inputs:** Parent source, versioned contract, named fixture/configuration, technical gate, quota reservation, and any approved lease are available.
- **Ownership:** One card owns its module/fixture namespace. A and B siblings do not share files, PRs, or mutable test leases.
- **Done:** Scoped behavior is usable, its stated check passes, relevant tests are automated, review/merge is complete, documentation and evidence are attached, and the behavior is available through its declared preview or harness surface.
- **Evidence:** Record card/parent IDs, mode, configuration/host, commit, test/run reference, verifier result, user-impact result, cleanup result, owner, reviewer, packet, and accepted time.
- **No false completion:** A replay is not native evidence. Unsupported/unverified positive behavior cannot pass as a native success. A negative experiment may pass its verifier while clearly reporting interrupted users.
- **No bonus credits:** Multiple parents, commits, test cases, repeated runs, and duplicated fixtures do not increase a card's Kano count.

### Portable A-card lesson contract

An A card delivers a standalone, browser-openable lesson bundle with a small interactive exercise: choose an action or condition, inspect a synthetic trace, and check the expected outcome. Use standard HTML/browser behavior so an approved application framework or Azure subscription is not needed to begin.

Each bundle declares source ID, objective, preconditions, actions, synthetic input/trace, expected assertions, and limits. It prominently says **Training rehearsal - synthetic data - not a live Azure result**, makes no management calls, contains no credentials, and supports keyboard operation.

Each lesson must add a worked, testable exercise rather than copying the backlog sentence. Keep it portable for later mounting by C041. The native implementation and evidence remain a separate B card, and the source demo is not complete until both required slices and its original acceptance gates pass.

## Concurrent pull and one-piece flow

1. Replenish by parent priority, age, available capability, and customer value. Prefer a ready safety/enabling slice once its quota exists; do not finish the entire lesson lane before enabling live value. Choose ready satisfiers when quota blocks a D/L.
2. Contributors pull one card; no bulk assignment or starting the next card while the previous PR awaits review.
3. Keep registries discoverable from per-card manifests instead of concurrent edits to one central list. Version shared ports/contracts before implementation against them.
4. Use separate namespaces: learning/Snnn, native/Snnn, capability/Cnnn, and delight/Xnnn. A/B siblings can progress concurrently when their own gates pass; B never waits merely for A's UI work.
5. Narrow dependencies to actual consumed capabilities. Contract-conforming components can be developed with explicit fixtures; parent-level release conditions are not blanket coding dependencies.
6. Preallocate approved leases for admitted native work. Provisioning queues, missing access, undecided stack choices, and unavailable reviewers are not hidden in To Do.
7. Attempt bounded same-card recovery first. Return an incomplete remainder to To Do with `readiness=false` and a concrete blocker when it cannot finish; never pull it again until its gates pass. Preserve the original Kano unit and any verified partial evidence without awarding an unfulfilled unit. Do not add a fourth workflow column.
8. For unavoidable long observations, implement a bounded, resumable collection slice and report its evidence limit. Do not promise five-nines proof merely to close a four-hour card.
9. Review ready PRs before pulling new work. Investigate cards older than one focused working day; remove causes of waiting instead of inflating WIP.
10. If an accepted credit is invalidated, surface the debt and stop new D/L admission until valid evidence restores the constraints. Never conceal a failed acceptance or invent compensating satisfiers.

## Entry gates and independence

Comma-separated gates mean AND. The following aliases are explicit capability contracts:

| Gate | Required cards or condition |
| --- | --- |
| SOURCE | The supplied backlog and portable lesson contract; available now. |
| SAFE | C056, which composes the required authorization, ownership, budget, state, oracle, and cleanup guards. |
| CORE | SAFE, C055, C020, C021, C023, C037, C038, C039, C040, C042, C043, C044, C045, C046, C049, C050, C051, C054, C058, C059. |
| DATA | C083, C084, C086, C088, C023. |
| ASANY | One approved configuration: C061 OR C062 OR C063. |
| ASIMAGE | C063. |
| ACA | C068, C072. |
| AKS | C073, C077. |
| FN | C079, C082. |
| HOST | ASANY OR ACA OR AKS OR FN; choose an applicable configuration from C003. |
| CONTAINER | ACA OR AKS. |
| IMAGEHOST | ASIMAGE OR ACA OR AKS. |
| HOSTJAVA | An explicitly Java-compatible ASANY, ACA, or AKS configuration. |
| JAVA | C097, C098, HOSTJAVA. |
| OBJECT | C087. |
| REPLICA | C085. |
| FENCE | C089. |
| REGION | C090, C095, C096, REPLICA, FENCE, HOST. |

Native provider qualification uses approved private leases and SAFE before public conducting is enabled. It does not depend on its own future qualification result. CORE/public operation requires the selected qualified capabilities and configuration evidence.

Capability cards are deliberately not gated on completion of unrelated whole epics. A source parent still retains its original backlog prerequisites and acceptance requirements when rolled up; component completion does not silently erase them.

An OR gate is one qualified target, not a demand to complete every provider. Proof is configuration-specific: an ACA result is not proof on AKS, and a code deployment is not proof of a custom container.

## Capability and workflow cards

All cards in this section target one selected configuration and one observable behavior. Their stated checks include focused positive/negative tests and the common Done contract.

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| C001 | H001 | D | Approve the first runtime/auth/hosting contract and decision owner; reject unapproved provisioning and unresolved implementation choices. | SOURCE |
| C002 | H001, H003, H012 | D | Validate one run-envelope schema end-to-end; reject out-of-range load, duration, capacity, and budget inputs explicitly. | C001 |
| C003 | H001, H002 | S | Publish the host/format capability matrix; show planned, qualified, unsupported, and unknown configurations accurately. | C001 |
| C004 | H001, H003 | S | Show a run-consent plan with cost/duration/resource assumptions; missing pricing cannot appear as zero-cost approval. | C002, C003 |
| C005 | H002 | S | Browse the 150 scenarios and two workflows; verify stable IDs and accurate availability labels. | C003 |
| C006 | H002 | S | Search catalog titles/objectives; verify exact, partial, empty, and no-result queries. | C003 |
| C007 | H002 | S | Filter catalog by host, risk, and readiness; verify incompatible entries explain why they cannot run. | C003 |
| C008 | H002 | S | Open a learner's prerequisites and limits; verify every source entry has an understandable preparation view. | C003 |
| C009 | H003, H012 | D | Enforce visitor/conductor/operator mutation permissions; valid identities succeed and forbidden commands fail server-side. | C001 |
| C010 | H003, H012 | D | Enforce lease ownership on every resource target; another conductor's resources remain inaccessible. | C001, C009 |
| C011 | H001, H003 | D | Reserve bounded lease capacity and spend; reject concurrent over-admission without consuming another lease's reservation. | C002, C010 |
| C012 | H003 | S | Explain reserved versus estimated capacity/cost; verify assumptions and remaining allowance are visible before running. | C003, C004, C011 |
| C013 | H003, H008 | S | List and reattach to one's leases; verify browser refresh preserves ownership and run selection. | C010, C015 |
| C014 | H003, H007, H011, H012 | D | Keep management secrets server-side and redact public evidence; seeded credentials/PII never reach browser exports. | C001, C009 |
| C015 | H001, H004 | D | Persist a versioned run/epoch and restore it after restart; verify no acknowledged state disappears. | C001 |
| C016 | H004, H012 | D | Make submit/command retries idempotent and epoch-conditional; concurrent duplicates produce one intended effect. | C015 |
| C017 | H004, H010, H012 | D | Reconcile cancellation during an in-flight action; verify cancellation is not a fabricated undo. | C015, C016 |
| C018 | H004, H008 | S | Reopen a run by ID and inspect its progress; verify completed and pending steps survive reconnect. | C015 |
| C019 | H004, H008 | S | Present typed errors and allowed recovery actions; verify failures are actionable without success-shaped fallbacks. | C015 |
| C020 | H005 | S | Deliver compatible getProfile v1/v2 fixtures with version stamps; verify stable profile semantics through both. | C001 |
| C021 | H005 | S | Deliver one incompatible contract plus its adapter; verify old/new consumers distinguish safe and breaking transitions. | C020 |
| C022 | H005, H012 | D | Isolate synthetic tenant/auth/session state; verify cross-tenant probes and invalid identity transitions fail. | C020, C009 |
| C023 | H005, P005 | S | Deliver a checkpointed job/effect ledger fixture; verify resume and effect counts are inspectable. | C020 |
| C024 | H005 | S | Deliver a multipart upload fixture; verify accepted part IDs and final content hash. | C020 |
| C025 | H005 | S | Deliver a ranged-download fixture; verify resumed bytes reproduce the original artifact. | C020 |
| C026 | H005 | S | Deliver a sequenced WebSocket fixture; verify acknowledged messages and resume cursors. | C020 |
| C027 | H005 | S | Deliver an SSE cursor fixture; verify ordered replay from the last accepted event. | C020 |
| C028 | H005, H006 | S | Deliver a native gRPC stream fixture/driver port; verify real protocol results rather than ordinary HTTP substitutes. | C020 |
| C029 | H001, H006, H012 | D | Evaluate journey outcomes against original latency/state budgets; injected failures cannot pass through retries. | C020, C023, C033 |
| C030 | H006, H012 | D | Detect missing/duplicate business effects; verify one intended effect remains distinct from delivery retries. | C023, C029 |
| C031 | H006, H012 | D | Distinguish actual transition from unchanged-version traffic; verify unchanged users cannot inflate migration success. | C029, C034 |
| C032 | H006 | S | Run an authenticated cookie-less client; verify its destination/state observations do not depend on browser cookies. | C020 |
| C033 | H006 | S | Pause/resume a browser journey around a chosen boundary; verify state and timing remain measurable. | C020 |
| C034 | H006, H007 | S | Inspect a saved per-client trace; verify action, version, and outcome ordering. | C020, C015 |
| C035 | H001, H007, H012 | D | Classify unsupported, unknown, cancelled, and interrupted results honestly; incomplete evidence cannot become success. | C015, C029 |
| C036 | H001, H007 | D | Correlate lease/run/user/epoch through tiers; mismatched or stale evidence cannot be attributed to the current run. | C015, C034 |
| C037 | H007 | S | Compare requested and observed routing; verify nominal weights do not replace measured destinations. | C036 |
| C038 | H007 | S | Inspect instance/dependency readiness and freshness; verify one successful probe does not imply pool readiness. | C036 |
| C039 | H007, H011 | S | Download a sanitized versioned evidence bundle; verify replay inputs and limits remain intact without secrets. | C014, C034, C035 |
| C040 | H007 | S | Inspect cohort/effect/latency result tables; verify failed and unknown attempts remain visible. | C029, C030, C031 |
| C041 | H002, H008 | S | Mount portable lessons without management access; verify training labels, isolation, and keyboard navigation. | C001 |
| C042 | H008 | S | Conduct one validated workflow step; verify inputs, explicit result, and supported recovery controls. | C016, C019, C035 |
| C043 | H008 | S | Execute a bounded preset automatically; verify it invokes the same validated steps as manual operation. | C042 |
| C044 | H004, H008 | S | Reconnect a live console stream without cancelling work; verify event resumption and duplicate handling. | C015, C019, C036 |
| C045 | H008 | S | Open isolated GA/preview client windows; verify identities and destinations remain separately observable. | C020, C041 |
| C046 | H008, H010 | S | Inspect reset progress and remaining resources; verify failed cleanup is visible rather than a cleared screen. | C017, C053 |
| C047 | H009, H012 | D | Enforce preview authorization on every reachable candidate path; unauthorized direct access remains denied. | C009, C022 |
| C048 | H009 | D | Gate tier/schema compatibility before admission; verify incompatible data/event consumers block expansion. | C021, C023 |
| C049 | H009 | S | Route one stable endpoint by approved cohort policy; verify actual caller/version association. | C020, C047, C048 |
| C050 | H009 | S | Promote one ring after its observation gate; verify regressions prevent the next promotion. | C049, C038, C040 |
| C051 | H009 | S | Show release eligibility separately from deployment state; a running preview is not automatically GA. | C049 |
| C052 | H010, H012 | D | Expire a lease and target only owned resources; verify unrelated resources survive attempted cleanup. | C010, C011, C015 |
| C053 | H004, H010, H012 | D | Reconcile checkpoint-aware teardown idempotently; repeated cleanup cannot destroy unresolved required work silently. | C052, C017 |
| C054 | H010, H011 | S | Recover an orphaned owned run from the console; verify remaining resources and recovery actions are auditable. | C053, C019 |
| C055 | H011 | D | Publish the approved HTTPS harness with source/disclaimer links and safe availability labels; verify public role boundaries. | C005, C041, C056, C059 |
| C056 | H011, H012 | D | Enforce a single execution admission gate; no live public action bypasses required guards, approval, or selected-provider qualification. | C001, C002, C009, C010, C011, C014, C015, C016, C017, C022, C029, C030, C031, C035, C036, C047, C048, C052, C053 |
| C057 | H011 | S | Share one sanitized completed-run report; verify audience permissions and absence of management credentials. | C039, C055 |
| C058 | H011 | S | Surface cost/health/cleanup alerts and acknowledgment; verify configured thresholds produce actionable notifications. | C011, C019, C053 |
| C059 | H008, H012 | D | Make the core conducting journey keyboard/screen-reader operable; verify focus, labels, errors, and status announcements. | C041, C042 |
| C060 | H012 | S | Show CI/configuration proof coverage; verify untested or stale configurations are not shown as qualified. | C003, C039 |
| C061 | P001 | S | Qualify one approved Windows code-slot deployment; verify native resource/version observations on the owned target. | SAFE, C020 |
| C062 | P001 | S | Qualify one approved Linux code-slot deployment; verify controlled operations without unsupported auto-swap. | SAFE, C020 |
| C063 | P001 | S | Qualify immutable App Service container startup; verify actual image/initialization observations. | SAFE, C020 |
| C064 | P001 | S | Execute a native slot swap primitive; verify target configuration, readiness, and former-worker recycling evidence. | SAFE, ASANY, DATA, C038 |
| C065 | P001 | S | Apply one bounded native manual scale change; verify effective instance counts rather than requested settings alone. | SAFE, ASANY, C038 |
| C066 | P001 | S | Apply an approved metric/schedule autoscale profile; verify native configuration and unsupported combinations. | SAFE, ASANY |
| C067 | P001 | S | Qualify shared/separate-plan placement; verify plan identity, reserved capacity, and routing targets. | SAFE, ASANY, C049 |
| C108 | P001 | S | Apply native App Service traffic weights and inspect sticky routing cookies; verify actual versus nominal destinations. | SAFE, ASANY, C049 |
| C068 | P002 | S | Deploy/inspect one owned ACA revision; verify immutable version and actual provisioning observations. | SAFE, C020 |
| C069 | P002 | S | Qualify readiness-gated single-revision replacement; verify the previous destination remains until native readiness permits change. | SAFE, C068, DATA, C038 |
| C070 | P002 | S | Apply multiple-revision traffic policy; verify actual revision destinations and retained prior capacity. | SAFE, C068, C049 |
| C071 | P002 | S | Apply a bounded revision-scale change; verify effective replicas and native limits. | SAFE, C068 |
| C072 | P002 | D | Close direct revision/label preview bypasses; verify unapproved callers cannot reach private v2 through alternate URLs. | SAFE, C068, C047 |
| C073 | P003 | S | Deploy version-specific AKS workloads/services; verify selectors never mix GA and preview unintentionally. | SAFE, C020 |
| C074 | P003 | S | Apply approved gateway cohort weights; verify version-specific backend routing rather than Deployment-only assumptions. | SAFE, C073, C049 |
| C075 | P003 | S | Apply one rollout/probe/surge policy; verify native readiness and available capacity observations. | SAFE, C073, C038 |
| C076 | P003 | S | Apply one approved workload-scaling profile; verify actual replica changes and selected metric support. | SAFE, C073 |
| C077 | P003 | D | Enforce namespace/worker fault boundaries and termination limits; foreign workloads remain untargetable. | SAFE, C073, C052 |
| C078 | P003 | S | Terminate one approved owned worker; verify replacement, grace behavior, and observed scope. | SAFE, C073, C077 |
| C079 | P004 | S | Deploy/inspect a supported Functions fixture; verify real hosting-plan and version observations. | SAFE, C020 |
| C080 | P004 | S | Execute a supported Functions slot swap; verify actual execution termination/recovery observations. | SAFE, C079, DATA, C038 |
| C081 | P004 | S | Start/observe an available Flex rolling update; verify native limits and explicitly unknown completion. | SAFE, C079 |
| C082 | P004 | D | Reject unsupported plan/slot/grace combinations; missing native completion evidence cannot be certified. | SAFE, C079, C035, C003 |
| C083 | P005 | D | Create an owned synthetic data fixture with private credentials; verify tenant/data boundaries and server-only access. | SAFE, C020 |
| C084 | P005 | S | Persist shared session state through the native data adapter; verify cross-version reads and TTL behavior. | SAFE, C083 |
| C085 | P005 | S | Qualify one approved replica/lag configuration; verify actual freshness and declared capability limits. | SAFE, C083 |
| C086 | P005 | S | Apply an approved cache-pressure/capacity profile; verify real cache effects and bounded resource use. | SAFE, C083 |
| C087 | P005 | S | Qualify native object storage operations; verify uploaded/ranged artifact bytes and authorization. | SAFE, C083 |
| C088 | P005 | S | Qualify message claim/renew/release/redelivery observations; verify ledger/checkpoint association. | SAFE, C083, C023 |
| C089 | P005 | S | Transfer one fenced writer/partition lease; verify stale epochs cannot commit effects. | SAFE, C083, C023 |
| C090 | P006 | D | Enforce an owned-domain/network-fault allowlist; production, foreign leases, and the shared management plane remain untargetable. | SAFE, C052 |
| C091 | P006 | S | Apply an owned test-DNS change; verify fresh/cached resolver observations and their scope. | SAFE, C090 |
| C092 | P006 | S | Probe an approved leased hostname/certificate; verify actual trust and hostname continuity. | SAFE, C090 |
| C093 | P006 | S | Probe one approved private endpoint/DNS path; verify the client is on the intended real access path. | SAFE, C090, HOST, DATA |
| C094 | P006 | S | Apply a bounded WAF policy to owned routes; verify benign valid traffic effects and restoration. | SAFE, C090, C095 |
| C095 | P006 | S | Register approved regional origins and probes; verify actual global-route destinations and health observations. | SAFE, C090, HOST, DATA |
| C096 | P006 | D | Gate regional ownership/data recovery and label outage proxies; unsupported RPO/consistency claims cannot pass. | SAFE, C095, C085, C089 |
| C097 | P007 | S | Package versioned Spring Boot fixtures for one approved Java host; verify actual artifact/runtime stamps. | C020, HOSTJAVA |
| C098 | P007 | S | Expose JVM/bean/readiness warm-up observations; verify cold/warm conditions are measured. | C097, C038 |
| C099 | P007 | S | Qualify servlet graceful shutdown; verify admitted work and termination-budget outcomes. | C097, C017 |
| C100 | P007 | S | Qualify the reactive-runtime shutdown variant; verify its own admitted-work behavior instead of borrowing servlet proof. | C097, C017 |
| C101 | W001 | S | Inspect ring membership and tier versions; verify pending rings differ from active deployment state. | CORE |
| C102 | W001 | S | Conduct one ring promotion and observation window; verify next-ring expansion remains gated. | C101, C050 |
| C103 | W001 | S | Recover one regressed ring; verify stopped expansion and retained per-ring outcomes. | C101, C017, C049 |
| C104 | W002 | S | Open the shared-orchestrator GA/preview walkthrough; verify independently routed versions and identities. | CORE, CONTAINER |
| C105 | W002 | S | Deliberately approve broader v2 eligibility; verify approval changes audience policy, not authentication correctness. | C104, C047, C051 |
| C106 | W002 | S | Conduct all-entry-point cutover; verify actual browser/API/microservice transitions and unresolved old clients. | C104, C049, C031 |
| C107 | W002 | S | Conduct v1 drain, retention, and retirement; verify no remaining required work/ownership is discarded. | C104, C052, C053 |

## Scenario cards

Each A/B row is an independent card, not half of a shared PR. Both have Kano class S because they add a distinct strategy-learning or conducting capability. Truthfulness, isolation, tests, and accessibility are mandatory Done criteria, not separate credit-generating tasks.

- **A:** Deliver the portable interactive rehearsal and its explicit synthetic assertions.
- **B:** Wire one bounded target preset to existing primitives, conduct the stated real experiment, and attach its observed evidence. Reuse prepared fixtures rather than building a new orchestration platform inside the card.
- B gates list actual capabilities, not unrelated UI stories. Source-parent prerequisites still apply to parent completion.
- When a gate allows alternatives, choose and record one qualified host/format; no cross-host borrowing of proof.

### A. Deployment and traffic migration

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S001 | D-S001 | S | Rehearse warming v2 before handoff; choosing an unready destination must fail the exercise. | SOURCE |
| B-S001 | D-S001 | S | Conduct one warm handoff; prove actual v2 admissions with intact state, effects, and latency. | CORE, DATA, HOST |
| A-S002 | D-S002 | S | Choose the native swap target/configuration; identify why retained slots do not prevent worker recycling. | SOURCE |
| B-S002 | D-S002 | S | Conduct one native swap; record target readiness, actual routing, and former-worker behavior. | CORE, DATA, ASANY, C064 |
| A-S003 | D-S003 | S | Advance a staged canary trace; a regressed observation must prevent the next increment. | SOURCE |
| B-S003 | D-S003 | S | Conduct one bounded canary stage; verify actual cohort movement and stopped expansion on regression. | CORE, DATA, HOST |
| A-S004 | D-S004 | S | Hold a 50/50 rehearsal; distinguish stable experiment cohorts from completed migration. | SOURCE |
| B-S004 | D-S004 | S | Hold a bounded live split and converge it; verify cohort stability and preserved state. | CORE, DATA, HOST |
| A-S005 | D-S005 | S | Move one synthetic tenant; detect double ownership or effects on an unrelated tenant. | SOURCE |
| B-S005 | D-S005 | S | Move one real fixture tenant; prove routing/state ownership and isolation from other fixture tenants. | CORE, DATA, HOST, FENCE |
| A-S006 | D-S006 | S | Compare authorized/unauthorized preview routes; an obscure URL must not count as authorization. | SOURCE |
| B-S006 | D-S006 | S | Conduct preview access probes through direct/indirect paths; prove only approved identities reach v2. | CORE, DATA, CONTAINER |
| A-S007 | D-S007 | S | Move new sessions while old work drains; reject premature retirement in the trace. | SOURCE |
| B-S007 | D-S007 | S | Conduct session-boundary migration; verify new admission, old completion, and unresolved-client gates. | CORE, DATA, HOST |
| A-S008 | D-S008 | S | Promote a ring with matching tier versions; detect shared-contract incompatibility before expansion. | SOURCE |
| B-S008 | D-S008 | S | Conduct one ring promotion; prove membership, tier affinity, observation gating, and actual user outcomes. | CORE, DATA, HOST |
| A-S009 | D-S009 | S | Compare shadow responses and effect counts; identify an unsafe duplicated side effect. | SOURCE |
| B-S009 | D-S009 | S | Shadow bounded getProfile traffic; verify production responses and zero unintended external effects. | CORE, DATA, HOST |
| A-S010 | D-S010 | S | Toggle a cohort feature flag and reverse it; detect incompatible configuration/state assumptions. | SOURCE |
| B-S010 | D-S010 | S | Conduct one cohort flag activation/reversal; verify unchanged deployment identity and correct ongoing journeys. | CORE, DATA, HOST |

### B. Capacity scaling

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S011 | D-S011 | S | Request extra instances; distinguish requested, deployed, ready, and traffic-eligible capacity. | SOURCE |
| B-S011 | D-S011 | S | Conduct bounded scale-out; verify effective ready capacity and client/dependency budgets. | CORE, DATA, ASANY, C065 |
| A-S012 | D-S012 | S | Raise synthetic CPU/memory demand; explain rule triggers without inferring user success. | SOURCE |
| B-S012 | D-S012 | S | Exercise one approved metric autoscale profile; correlate actual capacity and journey outcomes. | CORE, DATA, ASANY, C066 |
| A-S013 | D-S013 | S | Increase queue/concurrency pressure; select a valid metric and evaluate deadline outcomes. | SOURCE |
| B-S013 | D-S013 | S | Exercise one qualified workload-driven rule; verify native scaling and bounded backlog completion. | CORE, DATA, AKS, C076 |
| A-S014 | D-S014 | S | Schedule demand and prewarm capacity; identify late provisioning despite a correct calendar entry. | SOURCE |
| B-S014 | D-S014 | S | Conduct a short scheduled scale event; prove readiness precedes the declared demand window. | CORE, DATA, ASANY, C066 |
| A-S015 | D-S015 | S | Retire capacity with active requests/jobs; distinguish safe continuation from lost work. | SOURCE |
| B-S015 | D-S015 | S | Conduct one supported scale-in; verify admitted work, checkpoints, and actual retirement. | CORE, DATA, AKS, C075, C078 |
| A-S016 | D-S016 | S | Apply oscillating demand; compare stabilized versus repeated disruptive capacity changes. | SOURCE |
| B-S016 | D-S016 | S | Run one bounded oscillation comparison; verify actual scale behavior and cumulative user impact. | CORE, DATA, ASANY, C065, C066 |
| A-S017 | D-S017 | S | Compare in-place resize with ready parallel replacement; expose both cost and disruption tradeoffs. | SOURCE |
| B-S017 | D-S017 | S | Conduct one approved parallel replacement; verify ready larger capacity before routing handoff. | CORE, DATA, ASANY, C067 |
| A-S018 | D-S018 | S | Select a bottleneck tier; identify downstream pressure caused by indiscriminate scaling. | SOURCE |
| B-S018 | D-S018 | S | Scale one selected tier; verify intended capacity changes and end-to-end dependency limits. | CORE, DATA, AKS, C076 |
| A-S019 | D-S019 | S | Add a cell and move a tenant; reject routing before synchronized exclusive ownership. | SOURCE |
| B-S019 | D-S019 | S | Conduct one cell handoff with prepared capacity; verify tenant data and writer fencing. | CORE, DATA, HOST, FENCE |
| A-S020 | D-S020 | S | Exhaust a declared allowance; distinguish harness admission rejection from an Azure quota event. | SOURCE |
| B-S020 | D-S020 | S | Hit one bounded configured ceiling; prove safe rejection and intact existing service without false native-quota claims. | CORE, DATA, HOST |

### C. Readiness and warm-up

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S021 | D-S021 | S | Mark one candidate instance unready; one healthy reply must not approve the whole pool. | SOURCE |
| B-S021 | D-S021 | S | Conduct one per-instance readiness experiment; verify the unsafe destination remains ineligible. | CORE, DATA, HOST |
| A-S022 | D-S022 | S | Disable a required versus optional dependency; choose the appropriate readiness decision. | SOURCE |
| B-S022 | D-S022 | S | Isolate one required candidate dependency; prove gating and unchanged healthy production paths. | CORE, DATA, HOST |
| A-S023 | D-S023 | S | Warm a representative business path; detect a shallow probe that missed a failing transaction. | SOURCE |
| B-S023 | D-S023 | S | Warm one real synthetic business journey; verify readiness evidence and isolated effects. | CORE, DATA, HOST |
| A-S024 | D-S024 | S | Compare staging and effective production settings; identify identity/network/background-work differences. | SOURCE |
| B-S024 | D-S024 | S | Validate one slot with target configuration; verify real dependency access without duplicate work. | CORE, DATA, ASANY, C064 |
| A-S025 | D-S025 | S | Compare cold/warm JVM traces; separate initialization success from acceptable client latency. | SOURCE |
| B-S025 | D-S025 | S | Conduct one Java warm-up comparison; attach actual runtime and journey-latency observations. | CORE, DATA, JAVA |
| A-S026 | D-S026 | S | Delay image pull/startup; the trace must retain the old serving deployment until readiness. | SOURCE |
| B-S026 | D-S026 | S | Conduct one bounded image/startup failure; verify GA continuity and candidate ineligibility. | CORE, DATA, IMAGEHOST |
| A-S027 | D-S027 | S | Choose between 500, redirect, and misleading 200 probes; identify false-positive readiness. | SOURCE |
| B-S027 | D-S027 | S | Run one false-readiness fixture matrix; prove status/business gates reject unsafe promotion. | CORE, DATA, HOST |
| A-S028 | D-S028 | S | Expire warm-up; distinguish safe abort from completed user migration. | SOURCE |
| B-S028 | D-S028 | S | Conduct one timeout/abort; verify unchanged production routing and explicit error evidence. | CORE, DATA, HOST |
| A-S029 | D-S029 | S | Replay flapping probes; require a stable fresh window rather than a single green sample. | SOURCE |
| B-S029 | D-S029 | S | Conduct one flapping-readiness comparison; verify actual admission waits for the selected stability rule. | CORE, DATA, HOST |
| A-S030 | D-S030 | S | Compare simultaneous and bounded warm-up; identify overloaded shared dependencies. | SOURCE |
| B-S030 | D-S030 | S | Conduct a bounded warm-up concurrency comparison; verify initialization and live journey budgets. | CORE, DATA, HOST |

### D. Sessions, authentication, and state

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S031 | D-S031 | S | Switch local/shared session modes; detect state loss despite successful HTTP responses. | SOURCE |
| B-S031 | D-S031 | S | Switch real fixture clients across versions; prove shared-state continuity and detect local-state loss. | CORE, DATA, HOST |
| A-S032 | D-S032 | S | Inspect routing-cookie destinations; nominal percentages must not imply all users moved. | SOURCE |
| B-S032 | D-S032 | S | Conduct one native sticky-cookie reassignment; verify actual destinations and retirement dependencies. | CORE, DATA, ASANY, C108 |
| A-S033 | D-S033 | S | Remove affinity before/after state externalization; identify the unsafe sequence. | SOURCE |
| B-S033 | D-S033 | S | Conduct an affinity comparison on the chosen slot configuration; verify correct state under permitted removal. | CORE, DATA, ASANY, C108 |
| A-S034 | D-S034 | S | Rotate compatible/incompatible fixture keys; authentication failures cannot be reclassified as migration success. | SOURCE |
| B-S034 | D-S034 | S | Conduct one synthetic-app key-rotation comparison; verify valid sessions and rejection without exposing keys. | CORE, DATA, HOST |
| A-S035 | D-S035 | S | Start login before cutover and finish its callback afterward; detect loops or lost state. | SOURCE |
| B-S035 | D-S035 | S | Conduct a real fixture login across handoff; verify completion within the original budget. | CORE, DATA, HOST |
| A-S036 | D-S036 | S | Submit an old form after cutover; distinguish valid prior tokens from forged ones. | SOURCE |
| B-S036 | D-S036 | S | Conduct old-form submission across versions; verify continuity without weakened anti-forgery validation. | CORE, DATA, HOST |
| A-S037 | D-S037 | S | Read old session payloads with new code; identify incompatible serializers and silent resets. | SOURCE |
| B-S037 | D-S037 | S | Conduct one serializer transition/rollback; prove payload readability or explicit safe rejection. | CORE, DATA, HOST |
| A-S038 | D-S038 | S | Change destinations for two tenants; select assertions that expose cross-tenant access. | SOURCE |
| B-S038 | D-S038 | S | Conduct authorized/forbidden tenant probes across versions; verify identity and data isolation. | CORE, DATA, HOST |
| A-S039 | D-S039 | S | Move ownership of local/durable artifacts; detect loss hidden by an empty response. | SOURCE |
| B-S039 | D-S039 | S | Conduct one artifact-state handoff; verify durable bytes/authorization and visible local-state failure. | CORE, DATA, HOST, OBJECT |
| A-S040 | D-S040 | S | Remove browser cookies from an API-client trace; choose identity/routing rules that still work. | SOURCE |
| B-S040 | D-S040 | S | Conduct a cookie-less client transition; verify actual destination and state through the native host. | CORE, DATA, HOST, C032 |

### E. In-flight requests and long-lived work

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S041 | D-S041 | S | Cut over during a short request; distinguish old completion from new admission. | SOURCE |
| B-S041 | D-S041 | S | Conduct one timed in-flight request handoff; verify correct response and original latency budget. | CORE, DATA, HOST |
| A-S042 | D-S042 | S | Compare supported drain and durable continuation; retries cannot reset the original user budget. | SOURCE |
| B-S042 | D-S042 | S | Conduct one bounded long-work transition; verify completion/continuation or explicitly interrupted outcome. | CORE, DATA, HOST |
| A-S043 | D-S043 | S | Resume multipart upload after ownership change; verify accepted parts and final content hash. | SOURCE |
| B-S043 | D-S043 | S | Conduct one upload handoff/resume; verify real accepted parts, bytes, and completion budget. | CORE, DATA, HOST, OBJECT, C024 |
| A-S044 | D-S044 | S | Resume a ranged download; detect missing/duplicated bytes despite successful responses. | SOURCE |
| B-S044 | D-S044 | S | Conduct one real range-resume transition; verify final artifact hash and UX budget. | CORE, DATA, HOST, OBJECT, C025 |
| A-S045 | D-S045 | S | Reconnect a sequenced WebSocket; detect missing/duplicate acknowledged messages. | SOURCE |
| B-S045 | D-S045 | S | Conduct one stream handoff; verify sequence/state preservation and measured reconnect impact. | CORE, DATA, CONTAINER, C026 |
| A-S046 | D-S046 | S | Resume an SSE cursor; identify a gap hidden by a newly established stream. | SOURCE |
| B-S046 | D-S046 | S | Conduct one SSE transition; verify actual event order/completeness and client budget. | CORE, DATA, CONTAINER, C027 |
| A-S047 | D-S047 | S | Compare native gRPC and browser-proxy traces; do not treat ordinary HTTP as streaming proof. | SOURCE |
| B-S047 | D-S047 | S | Conduct one native gRPC stream transition; verify protocol and continuation through the chosen gateway. | CORE, DATA, AKS, C028, C074 |
| A-S048 | D-S048 | S | Retire a checkpointed worker; distinguish resumable work from falsely completed jobs. | SOURCE |
| B-S048 | D-S048 | S | Conduct one active-job retirement; verify correct checkpointed continuation and effect totals. | CORE, DATA, HOST |
| A-S049 | D-S049 | S | Lose a committed POST response and retry; choose the result with one business effect. | SOURCE |
| B-S049 | D-S049 | S | Conduct one ambiguous-response retry; verify one effect and honest unresolved outcomes. | CORE, DATA, HOST |
| A-S050 | D-S050 | S | Retire a destination with stale connections/cookies; expose the remaining dependency. | SOURCE |
| B-S050 | D-S050 | S | Conduct a pinned-client retirement experiment; verify required old routing remains until resolved. | CORE, DATA, ASANY, C108 |

### F. N-tier and version compatibility

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S051 | D-S051 | S | Send old-frontend requests to new APIs; identify a breaking response shape. | SOURCE |
| B-S051 | D-S051 | S | Conduct old-client journeys against the new native deployment; verify contract correctness and visible failures. | CORE, DATA, HOST |
| A-S052 | D-S052 | S | Send new-frontend requests to old APIs; reject success for unavailable required features. | SOURCE |
| B-S052 | D-S052 | S | Conduct new-client journeys under mixed routing; verify supported old contracts and explicit incompatibility. | CORE, DATA, HOST |
| A-S053 | D-S053 | S | Distinguish software and API versions; an incompatible endpoint switch must not count as safe migration. | SOURCE |
| B-S053 | D-S053 | S | Conduct one adapter-backed cutover; verify old/new consumers retain their declared contracts. | CORE, DATA, HOST |
| A-S054 | D-S054 | S | Sequence expand, migrate, and contract; reject contraction while old consumers remain. | SOURCE |
| B-S054 | D-S054 | S | Conduct one staged native data migration under mixed clients; verify safe contraction gates. | CORE, DATA, HOST, FENCE |
| A-S055 | D-S055 | S | Read mixed cache payloads; identify when translation or versioned namespaces are required. | SOURCE |
| B-S055 | D-S055 | S | Conduct one cached-payload transition; verify cross-version correctness and explicit incompatible reads. | CORE, DATA, HOST |
| A-S056 | D-S056 | S | Mix producer/consumer schemas; choose compatibility checks before introducing a new producer. | SOURCE |
| B-S056 | D-S056 | S | Conduct one event-schema transition; verify real consumer interpretation and business effects. | CORE, DATA, HOST |
| A-S057 | D-S057 | S | Load old HTML after deployment; detect asset retirement that breaks an existing page. | SOURCE |
| B-S057 | D-S057 | S | Conduct one old-page/native-deployment transition; verify required immutable assets still render. | CORE, DATA, HOST, OBJECT |
| A-S058 | D-S058 | S | Replay durable execution history under different versions; identify the valid version-match strategy. | SOURCE |
| B-S058 | D-S058 | S | Conduct one durable workflow version transition; verify history remains valid or incompatibility is detected. | CORE, DATA, FN, C080 |
| A-S059 | D-S059 | S | Interpret flags/configuration with old/new code; detect divergent meanings of one shared setting. | SOURCE |
| B-S059 | D-S059 | S | Conduct one configuration-version change; verify mixed readers and explicit incompatible publication. | CORE, DATA, HOST |
| A-S060 | D-S060 | S | Roll back after schema evolution; distinguish compatible reversal from required forward recovery. | SOURCE |
| B-S060 | D-S060 | S | Conduct one data-aware recovery path; verify retained committed state and rejected unsafe reversal. | CORE, DATA, HOST, FENCE |

### G. Database and persistent data

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S061 | D-S061 | S | Add a reader; preserve read-your-writes rather than assuming every replica is current. | SOURCE |
| B-S061 | D-S061 | S | Conduct one native reader expansion; verify actual read routing and freshness contract. | CORE, DATA, HOST, REPLICA |
| A-S062 | D-S062 | S | Multiply per-instance pools during scaling; detect aggregate database-connection exhaustion. | SOURCE |
| B-S062 | D-S062 | S | Conduct bounded scale-out with pool settings; verify total connections and end-to-end budgets. | CORE, DATA, ASANY, C065 |
| A-S063 | D-S063 | S | Compare data-tier resize/failover paths; identify operations that are not online. | SOURCE |
| B-S063 | D-S063 | S | Conduct one approved native data-capacity change; verify reconnects, transactions, and stated interruption limits. | CORE, DATA, HOST, REPLICA |
| A-S064 | D-S064 | S | Assign a new shard before/after synchronization; reject ambiguous writer ownership. | SOURCE |
| B-S064 | D-S064 | S | Conduct one prepared-shard handoff; verify copied committed data and exclusive writes. | CORE, DATA, HOST, FENCE |
| A-S065 | D-S065 | S | Move a hot partition; detect routing gaps and simultaneous active owners. | SOURCE |
| B-S065 | D-S065 | S | Conduct one bounded partition rebalance; verify correct data and fenced ownership. | CORE, DATA, HOST, FENCE |
| A-S066 | D-S066 | S | Fail during commit; classify committed, failed, and unresolved outcomes without duplicating effects. | SOURCE |
| B-S066 | D-S066 | S | Conduct one commit/failover fault; verify actual reconciliation and effect counts. | CORE, DATA, HOST, REPLICA |
| A-S067 | D-S067 | S | Introduce reader lag; choose a route meeting the declared freshness requirement. | SOURCE |
| B-S067 | D-S067 | S | Conduct one native lag observation/routing experiment; verify real reader choice and freshness. | CORE, DATA, HOST, REPLICA |
| A-S068 | D-S068 | S | Build an index under load; compare permitted online behavior with blocking locks. | SOURCE |
| B-S068 | D-S068 | S | Conduct one supported index experiment; verify native locks, latency, and explicit capability limits. | CORE, DATA, HOST |
| A-S069 | D-S069 | S | Transfer writer epochs; stale writers must not regain authority. | SOURCE |
| B-S069 | D-S069 | S | Conduct one fenced writer handoff; prove old-epoch rejection and retained acknowledged effects. | CORE, DATA, HOST, FENCE |
| A-S070 | D-S070 | S | Promote a restored replica; reject missing committed boundaries or invalid ownership. | SOURCE |
| B-S070 | D-S070 | S | Conduct one restored-capacity promotion; verify synchronization boundary and writer eligibility. | CORE, DATA, HOST, REPLICA, FENCE |

### H. Caches, queues, and workers

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S071 | D-S071 | S | Resize cache with mixed readers; detect payload incompatibility masked by extra capacity. | SOURCE |
| B-S071 | D-S071 | S | Conduct one native cache-capacity change; verify real effects and mixed-version correctness. | CORE, DATA, HOST |
| A-S072 | D-S072 | S | Compare unbounded and coalesced refill; identify a database-overloading stampede. | SOURCE |
| B-S072 | D-S072 | S | Conduct one bounded cold-cache comparison; verify refill pressure and client latency. | CORE, DATA, HOST |
| A-S073 | D-S073 | S | Lose cache access; an empty user profile must not be a successful fallback. | SOURCE |
| B-S073 | D-S073 | S | Conduct one cache outage/recovery; verify correct durable state or explicit failure. | CORE, DATA, HOST |
| A-S074 | D-S074 | S | Apply session eviction pressure; distinguish acceptable cache misses from lost required state. | SOURCE |
| B-S074 | D-S074 | S | Conduct one bounded eviction experiment; verify required session/state continuity. | CORE, DATA, HOST |
| A-S075 | D-S075 | S | Add consumers; detect duplicate owners and duplicate business effects. | SOURCE |
| B-S075 | D-S075 | S | Conduct one native consumer expansion; verify queue ownership, progress, and effects. | CORE, DATA, AKS, C076 |
| A-S076 | D-S076 | S | Remove a consumer holding work; select valid finish, renew, or release behavior. | SOURCE |
| B-S076 | D-S076 | S | Conduct one claimed-work retirement; verify safe checkpoint/ownership transfer. | CORE, DATA, AKS, C078 |
| A-S077 | D-S077 | S | Redeliver one message; distinguish repeated delivery from repeated business effects. | SOURCE |
| B-S077 | D-S077 | S | Conduct one lock-expiry/redelivery cycle; verify one effect and honest processing outcome. | CORE, DATA, HOST |
| A-S078 | D-S078 | S | Start two schedulers; use lease/fencing evidence to identify the valid executor. | SOURCE |
| B-S078 | D-S078 | S | Conduct one concurrent-scheduler experiment; verify one owned scheduled effect. | CORE, DATA, HOST, FENCE |
| A-S079 | D-S079 | S | Burst the backlog; evaluate ordering and completion deadlines rather than throughput alone. | SOURCE |
| B-S079 | D-S079 | S | Conduct one bounded backlog burst; verify native progress, ordering, and deadline failures. | CORE, DATA, AKS, C076 |
| A-S080 | D-S080 | S | Reassign a partition; detect missing checkpoint transfer despite successful new ownership. | SOURCE |
| B-S080 | D-S080 | S | Conduct one native consumer rebalance; verify checkpoints, event coverage, and effects. | CORE, DATA, HOST, FENCE |

### I. State machine and orchestration

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S081 | D-S081 | S | Advance desired/observed states; a warm boolean cannot bypass routing/drain gates. | SOURCE |
| B-S081 | D-S081 | S | Conduct one live lifecycle; verify epochs and actual evidence at each observable gate. | CORE, DATA, HOST |
| A-S082 | D-S082 | S | Deliver a stale epoch update; it must not alter current routing/readiness. | SOURCE |
| B-S082 | D-S082 | S | Deliver one stale update to the owned controller; verify rejection and unchanged current service. | CORE, DATA, HOST |
| A-S083 | D-S083 | S | Restart a controller trace; identify duplicate destructive work after unsafe resumption. | SOURCE |
| B-S083 | D-S083 | S | Restart one owned run worker; verify durable progress and no duplicated platform actions. | CORE, DATA, HOST |
| A-S084 | D-S084 | S | Retry commands; recognize duplicate resources or unintended second swaps. | SOURCE |
| B-S084 | D-S084 | S | Replay one native command retry sequence; verify idempotent effects and audit identity. | CORE, DATA, HOST |
| A-S085 | D-S085 | S | Submit competing promotions; only the valid lock/epoch owner may act. | SOURCE |
| B-S085 | D-S085 | S | Conduct two bounded competing submissions; verify explicit rejection/serialization and isolated leases. | CORE, DATA, HOST |
| A-S086 | D-S086 | S | Expire readiness before promotion; force revalidation instead of trusting an old green snapshot. | SOURCE |
| B-S086 | D-S086 | S | Conduct one expired-readiness promotion attempt; verify safe gating and fresh evidence requirements. | CORE, DATA, HOST |
| A-S087 | D-S087 | S | Apply only part of a routing change; remaining clients must retain a valid destination. | SOURCE |
| B-S087 | D-S087 | S | Conduct one bounded convergence experiment; verify observed routing and old-capacity retention. | CORE, DATA, HOST |
| A-S088 | D-S088 | S | Deny an operation; identify an invalid success-shaped error response. | SOURCE |
| B-S088 | D-S088 | S | Deny one scoped native permission; verify visible failure and preserved known routing/state. | CORE, DATA, HOST |
| A-S089 | D-S089 | S | Lose management connectivity; separate control-plane availability from data-plane service. | SOURCE |
| B-S089 | D-S089 | S | Isolate an owned management path; verify continuing data journeys and independent harness recovery. | CORE, DATA, HOST, C090 |
| A-S090 | D-S090 | S | Attempt early retirement; unresolved users/work/retention must reject it. | SOURCE |
| B-S090 | D-S090 | S | Conduct one premature retirement request; prove the native destination remains while dependencies exist. | CORE, DATA, HOST |

### J. Failure containment and rollback

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S091 | D-S091 | S | Crash a warming candidate; distinguish safe abort from completed migration. | SOURCE |
| B-S091 | D-S091 | S | Conduct one bounded warm-up crash; verify no candidate exposure and intact production journeys. | CORE, DATA, HOST |
| A-S092 | D-S092 | S | Fail a canary; failed journeys remain interruptions despite successful rollback. | SOURCE |
| B-S092 | D-S092 | S | Conduct one canary regression/recovery; verify stopped expansion and retained failure accounting. | CORE, DATA, HOST |
| A-S093 | D-S093 | S | Return slow 200 responses; an exceeded journey budget must fail acceptance. | SOURCE |
| B-S093 | D-S093 | S | Conduct one latency-only regression; verify stopped expansion without relying on HTTP error counts. | CORE, DATA, HOST |
| A-S094 | D-S094 | S | Break candidate authentication; detect forced reauthentication or rejected valid sessions. | SOURCE |
| B-S094 | D-S094 | S | Conduct one synthetic-app auth regression; verify stopped exposure without bypassing validation. | CORE, DATA, HOST |
| A-S095 | D-S095 | S | Partition a required candidate dependency; identify safe versus unsafe admission decisions. | SOURCE |
| B-S095 | D-S095 | S | Isolate one required candidate path; verify preserved healthy routing and explicit affected outcomes. | CORE, DATA, HOST, C090 |
| A-S096 | D-S096 | S | Warm competing slots; distinguish shared-plan pressure from real added compute. | SOURCE |
| B-S096 | D-S096 | S | Conduct one shared/separate-plan comparison; verify actual contention, capacity, and client effects. | CORE, DATA, ASANY, C067 |
| A-S097 | D-S097 | S | Compare warm/cold rollback standby; detect a violated recovery promise. | SOURCE |
| B-S097 | D-S097 | S | Conduct one retained-capacity comparison; verify actual recovery latency and remaining state. | CORE, DATA, HOST |
| A-S098 | D-S098 | S | Roll back after new writes; choose compatible recovery rather than discarding committed state. | SOURCE |
| B-S098 | D-S098 | S | Conduct one write-aware recovery; verify retained effects and correct old/new interpretation. | CORE, DATA, HOST, FENCE |
| A-S099 | D-S099 | S | Fail rollback itself; reject a blindly repeated reversal with unknown effective routing. | SOURCE |
| B-S099 | D-S099 | S | Conduct one bounded recovery failure; verify reconciled routing and honest incomplete state. | CORE, DATA, HOST |
| A-S100 | D-S100 | S | Kill active work; the educational test may pass while user impact is interrupted. | SOURCE |
| B-S100 | D-S100 | S | Conduct one owned forced termination; verify loss/retry/duplicate accounting and cleanup separately. | CORE, DATA, AKS, C078 |

### K. Networking, configuration, and routing

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S101 | D-S101 | S | Switch backends behind a stable getProfile endpoint; callers must retain valid contracts. | SOURCE |
| B-S101 | D-S101 | S | Conduct one stable-endpoint switch; verify actual backend changes without caller endpoint changes. | CORE, DATA, HOST |
| A-S102 | D-S102 | S | Compare fresh/cached DNS answers; identify why immediate convergence cannot be assumed. | SOURCE |
| B-S102 | D-S102 | S | Conduct one owned DNS change; verify resolver-specific observations and retained cached destinations. | CORE, DATA, HOST, C091 |
| A-S103 | D-S103 | S | Select certificate/hostname combinations; reject an invalid eligible destination. | SOURCE |
| B-S103 | D-S103 | S | Conduct one native TLS continuity check across destinations; verify real client trust and hostname results. | CORE, DATA, HOST, C092 |
| A-S104 | D-S104 | S | Compare internal warm-up and external redirects/callbacks; detect misleading internal success. | SOURCE |
| B-S104 | D-S104 | S | Conduct one real external-path comparison; verify host headers, redirects, callback state, and limits. | CORE, DATA, HOST, C092 |
| A-S105 | D-S105 | S | Swap settings with distinct identities/networks; identify properties that do not move. | SOURCE |
| B-S105 | D-S105 | S | Conduct one native slot-configuration transition; verify effective identity/network access after swap. | CORE, DATA, ASANY, C064 |
| A-S106 | D-S106 | S | Compare public and private probes; public success cannot certify a private dependency path. | SOURCE |
| B-S106 | D-S106 | S | Conduct one native private-path probe; verify actual client placement and private DNS/connectivity. | CORE, DATA, HOST, C093 |
| A-S107 | D-S107 | S | Change CORS policy between versions; identify real browser enforcement without bypassing denials. | SOURCE |
| B-S107 | D-S107 | S | Conduct one two-origin browser transition; verify valid access and explicit forbidden access. | CORE, DATA, HOST, C092 |
| A-S108 | D-S108 | S | Apply a mismatched WAF policy to valid traffic; detect blocked journeys/assets. | SOURCE |
| B-S108 | D-S108 | S | Conduct one bounded leased-route policy comparison; verify actual benign request effects and restoration. | CORE, DATA, HOST, C094 |
| A-S109 | D-S109 | S | Raise outbound connections; missing native SNAT evidence must stay unverified. | SOURCE |
| B-S109 | D-S109 | S | Conduct one approved outbound-pressure run; verify native evidence availability and bounded user impact. | CORE, DATA, HOST, C090 |
| A-S110 | D-S110 | S | Propagate an edge change; nominal configuration must not imply all origins have converged. | SOURCE |
| B-S110 | D-S110 | S | Conduct one actual global-route change; verify sampled effective destinations and old-origin retention. | CORE, DATA, HOST, C095 |

### L. Zones, regions, and failure domains

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S111 | D-S111 | S | Lose one worker; distinguish application-worker, node, zone, and region failures. | SOURCE |
| B-S111 | D-S111 | S | Terminate one owned worker under load; verify surviving capacity and actual failure scope. | CORE, DATA, AKS, C078 |
| A-S112 | D-S112 | S | Isolate a zone's fixture workloads; do not label it an actual Azure-zone outage. | SOURCE |
| B-S112 | D-S112 | S | Conduct one approved zonal-workload proxy fault; verify placement, surviving service, and explicit proxy labeling. | CORE, DATA, AKS, REGION, C078 |
| A-S113 | D-S113 | S | Evacuate a region; require warm capacity, synchronized state, and exclusive writer ownership. | SOURCE |
| B-S113 | D-S113 | S | Conduct one planned regional handoff; verify real routing, data boundary, and writer eligibility. | CORE, DATA, REGION |
| A-S114 | D-S114 | S | Fail owned regional origins/dependencies; distinguish proxy observations from full-region guarantees. | SOURCE |
| B-S114 | D-S114 | S | Conduct one bounded origin/dependency isolation; verify detection, surviving capacity, and honest recovery scope. | CORE, DATA, REGION |
| A-S115 | D-S115 | S | Compare warm/cold standby; a healthy shallow endpoint is not complete readiness. | SOURCE |
| B-S115 | D-S115 | S | Conduct one standby comparison; verify actual dependency/state readiness and client recovery budgets. | CORE, DATA, REGION |
| A-S116 | D-S116 | S | Serve both regions; identify the real writer/consistency model instead of assuming multi-writer support. | SOURCE |
| B-S116 | D-S116 | S | Conduct one approved active-active application experiment; verify actual writer topology and data contracts. | CORE, DATA, REGION |
| A-S117 | D-S117 | S | Keep shallow health green during dependency failure; identify the failing regional business path. | SOURCE |
| B-S117 | D-S117 | S | Conduct one partial regional dependency fault; verify correct readiness/routing and affected outcomes. | CORE, DATA, REGION |
| A-S118 | D-S118 | S | Fail over a mutating journey; detect duplicate effects or lost identity after rerouting. | SOURCE |
| B-S118 | D-S118 | S | Conduct one global-route failover; verify actual alternate-origin use and state/effect continuity. | CORE, DATA, REGION |
| A-S119 | D-S119 | S | Restore a region and fail back; reject return before synchronization/ownership checks. | SOURCE |
| B-S119 | D-S119 | S | Conduct one controlled failback; verify gated data/ownership and measured client continuity. | CORE, DATA, REGION |
| A-S120 | D-S120 | S | Remove all viable destinations; recognize unavoidable interruption rather than inventing zero-downtime success. | SOURCE |
| B-S120 | D-S120 | S | Conduct a dedicated-lease all-destinations fault; verify expected interruption, stated limits, and owned-resource recovery. | CORE, DATA, REGION |

### M. Hosting-model-specific demonstrations

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S121 | D-S121 | S | Rehearse Windows code-slot promotion; identify configuration/readiness evidence needed for a native claim. | SOURCE |
| B-S121 | D-S121 | S | Conduct one Windows code swap preset; verify actual target configuration and client outcomes. | CORE, DATA, C061, C064 |
| A-S122 | D-S122 | S | Choose a supported Linux promotion path; reject unsupported native auto-swap. | SOURCE |
| B-S122 | D-S122 | S | Conduct one Linux controlled swap preset; verify native observations without auto-swap claims. | CORE, DATA, C062, C064 |
| A-S123 | D-S123 | S | Prepare an immutable container; detect startup assumptions and unsupported automatic swap. | SOURCE |
| B-S123 | D-S123 | S | Conduct one custom-container slot preset; verify actual image, initialization, and native swap outcomes. | CORE, DATA, C063, C064 |
| A-S124 | D-S124 | S | Compare slots and separate plans; identify true isolation and lifecycle-control differences. | SOURCE |
| B-S124 | D-S124 | S | Conduct one plan-placement comparison; verify native capacity, cost assumptions, and handoff/drain evidence. | CORE, DATA, ASANY, C067 |
| A-S125 | D-S125 | S | Update a single ACA revision; the old revision remains until candidate readiness. | SOURCE |
| B-S125 | D-S125 | S | Conduct one single-revision update; verify actual readiness gating and active-work outcomes. | CORE, DATA, ACA, C069 |
| A-S126 | D-S126 | S | Split multiple revisions and retire one; preview access and old-work gates remain necessary. | SOURCE |
| B-S126 | D-S126 | S | Conduct one multiple-revision preset; verify native routing, authorized preview, and controlled retirement. | CORE, DATA, ACA, C070 |
| A-S127 | D-S127 | S | Choose rollout/probe/surge/grace settings; a PDB is not universal failure protection. | SOURCE |
| B-S127 | D-S127 | S | Conduct one AKS rolling preset; verify actual readiness, surge capacity, and graceful termination. | CORE, DATA, AKS, C075, C078 |
| A-S128 | D-S128 | S | Route GA/preview to separate AKS versions; identify a selector that accidentally mixes audiences. | SOURCE |
| B-S128 | D-S128 | S | Conduct one AKS cohort preset; verify version-specific services, gateway routing, and user evidence. | CORE, DATA, AKS, C074 |
| A-S129 | D-S129 | S | Swap active Functions executions; distinguish termination/replay from guaranteed zero downtime. | SOURCE |
| B-S129 | D-S129 | S | Conduct one supported Functions swap; verify native execution outcomes and one intended business effect. | CORE, DATA, FN, C080 |
| A-S130 | D-S130 | S | Compare single/multi-instance Flex traces; unknown completion or grace limits cannot be certified away. | SOURCE |
| B-S130 | D-S130 | S | Conduct one available Flex preset; verify native grace/version observations and explicitly bounded conclusions. | CORE, DATA, FN, C081 |

### N. Complete end-user journeys

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S131 | D-S131 | S | Load old/new page assets during cutover; successful HTML alone must not pass rendering. | SOURCE |
| B-S131 | D-S131 | S | Conduct one browsing transition; verify complete rendered-page and required-asset correctness. | CORE, DATA, HOST, OBJECT |
| A-S132 | D-S132 | S | Finish a sign-in across cutover; detect forced restart or lost callback state. | SOURCE |
| B-S132 | D-S132 | S | Conduct one interactive sign-in transition; verify continuity and the original journey budget. | CORE, DATA, HOST |
| A-S133 | D-S133 | S | Continue an old multi-step form; detect lost answers, invalid prior tokens, or duplicate submission. | SOURCE |
| B-S133 | D-S133 | S | Conduct one form journey across versions; verify state, validation, permissions, and one final effect. | CORE, DATA, HOST |
| A-S134 | D-S134 | S | Retry checkout after response loss; select the ledger showing one correct order. | SOURCE |
| B-S134 | D-S134 | S | Conduct one synthetic checkout transition; verify real effect counts and honest unresolved outcomes. | CORE, DATA, HOST |
| A-S135 | D-S135 | S | Redeliver a delayed webhook; distinguish event attempts from business effects. | SOURCE |
| B-S135 | D-S135 | S | Conduct one sandbox webhook transition; verify correct deduplicated processing and user-visible status. | CORE, DATA, HOST |
| A-S136 | D-S136 | S | Take only the sample client offline; synchronize pending changes without losing the harness console. | SOURCE |
| B-S136 | D-S136 | S | Conduct one offline-client synchronization; verify queued effects, identity, and explicit network assumptions. | CORE, DATA, HOST, C032 |
| A-S137 | D-S137 | S | Reuse an old service-worker bundle; detect incompatible API/assets despite a fresh backend. | SOURCE |
| B-S137 | D-S137 | S | Conduct one cached-client transition; verify actual old-bundle rendering and API contract continuity. | CORE, DATA, HOST, OBJECT |
| A-S138 | D-S138 | S | Reuse a pagination cursor after migration; identify unintended missing/duplicate results. | SOURCE |
| B-S138 | D-S138 | S | Conduct one paginated native journey; verify declared cursor/snapshot semantics across versions. | CORE, DATA, HOST |
| A-S139 | D-S139 | S | Reconnect collaborative editing; preserve acknowledged edit order and document state. | SOURCE |
| B-S139 | D-S139 | S | Conduct one real-time editing transition; verify actual acknowledged state through connection recovery. | CORE, DATA, CONTAINER, C026 |
| A-S140 | D-S140 | S | Submit, process, poll, and download an export across tiers; detect a lost artifact or authorization. | SOURCE |
| B-S140 | D-S140 | S | Conduct one asynchronous export transition; verify job state, artifact bytes, and authorized access. | CORE, DATA, HOST, OBJECT, C025 |

### O. Demonstration and acceptance testing

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| A-S141 | D-S141 | S | Inspect a steady-load trace; distinguish affected user transitions from total request throughput. | SOURCE |
| B-S141 | D-S141 | S | Conduct one approved steady-load batch; verify client outcomes and actual version movement. | CORE, DATA, HOST |
| A-S142 | D-S142 | S | Burst demand during initialization; detect contention hidden by separate tier benchmarks. | SOURCE |
| B-S142 | D-S142 | S | Conduct one bounded warm-up burst; verify shared pressure and explicit envelope violations. | CORE, DATA, HOST |
| A-S143 | D-S143 | S | Slow a client/reconnect; retries must remain inside the original journey budget. | SOURCE |
| B-S143 | D-S143 | S | Conduct one labeled network-variability profile; verify real client impact and emulation limits. | CORE, DATA, HOST, C090 |
| A-S144 | D-S144 | S | Combine tier pressure; identify the bottleneck obscured by successful isolated measurements. | SOURCE |
| B-S144 | D-S144 | S | Conduct one bounded multi-tier profile; verify correlated capacity, data, queue, and client evidence. | CORE, DATA, HOST |
| A-S145 | D-S145 | S | Repeat transition cycles; detect cumulative connection/memory/cache growth and retained failures. | SOURCE |
| B-S145 | D-S145 | S | Conduct one resumable bounded soak segment; verify trends and preserved per-cycle outcomes. | CORE, DATA, HOST |
| A-S146 | D-S146 | S | Inject a trace fault at a lifecycle phase; unobserved timing must stay uncovered. | SOURCE |
| B-S146 | D-S146 | S | Conduct one observable-phase fault preset; verify phase evidence and explicit native timing limits. | CORE, DATA, HOST, C090 |
| A-S147 | D-S147 | S | Inspect misleading 200/state-loss/duplicate fixtures; choose the correct client-side failure verdicts. | SOURCE |
| B-S147 | D-S147 | S | Conduct one oracle conformance experiment; verify injected acceptance failures cannot pass through health status. | CORE, DATA, HOST |
| A-S148 | D-S148 | S | Read tier/version traces; unchanged users must not count as successful migration. | SOURCE |
| B-S148 | D-S148 | S | Conduct one actual-versus-false transition comparison; verify version evidence controls migration attribution. | CORE, DATA, HOST |
| A-S149 | D-S149 | S | Compare request/user/event counts; verify the 299,572-trial illustration and insufficient-evidence warning. | SOURCE |
| B-S149 | D-S149 | S | Collect one approved native evidence batch; verify correlation-aware counting and an honest confidence gap, not certification. | CORE, DATA, HOST |
| A-S150 | D-S150 | S | Retire v1 with outstanding dependencies; identify the check that must prevent deletion. | SOURCE |
| B-S150 | D-S150 | S | Conduct one retirement verification; prove routing/work/state/retention gates and export remaining-resource status. | CORE, DATA, HOST |

## Optional delighters and tandem packets

These are optional, explicitly scoped product hypotheses, not extra requirements silently added to source-parent completion. Each still needs a customer-visible acceptance check and the same small-PR/Done discipline.

| Card | Parent(s) | Kano | Deliver and verify | Technical entry gate |
| --- | --- | --- | --- | --- |
| X001 | H007, H008 | L | Scrub a saved run timeline backward/forward without re-execution; verify displayed states match recorded events and limits. | C034, C044 |
| X002 | H007 | L | Compare two accepted runs side-by-side; verify version, latency, routing, and effect differences reference real evidence. | C039, C040 |
| X003 | H002 | L | Suggest a next learning exercise from a chosen goal; verify deterministic relevant links without profiling or external AI services. | C005, C006, C007 |
| X004 | W001 | L | Animate a recorded ring promotion with clickable blocked gates; verify the explanation never invents an unobserved transition. | C101, C102, C103 |
| X005 | W002 | L | Synchronize approved GA/preview presentation actions; verify identities stay isolated and client outcomes remain independently visible. | C104, C105, C106, C107 |
| X006 | H007, H011 | L | Export a self-contained sanitized HTML run story; verify offline replay works without management calls, credentials, or stronger reliability claims. | C039, C041, C057 |

The register assigns one delighter and six distinct S companions per packet:

| Packet | Delighter | Six satisfier companions |
| --- | --- | --- |
| LP-REPLAY | X001 | C018, C034, C037, C038, C040, C044 |
| LP-COMPARE | X002 | A-S096, B-S096, A-S097, B-S097, A-S098, B-S098 |
| LP-LEARN | X003 | C005, C006, C007, C008, A-S001, A-S010 |
| LP-RINGS | X004 | A-S003, B-S003, A-S005, B-S005, A-S008, B-S008 |
| LP-PROFILE | X005 | C104, C105, C106, C107, A-S006, B-S006 |
| LP-EXPORT | X006 | C039, C057, A-S141, B-S141, A-S148, B-S148 |

Packet membership is fixed before admission. This register overrides default membership for its named cards; every other A/B card belongs to SC-Snnn, and every other capability card belongs to its first listed source parent. A card has one packet, not duplicate packet credits.

The six companions may finish concurrently or sequentially. The delighter is admitted only after all six are accepted Done within that packet and cumulative quota is available. Packet closure is a roll-up, not a batch handoff or a reason to hold finished satisfiers.

## Parent completion and traceability

- Every one of the 150 D-S parents has exactly two required children: A-Snnn and B-Snnn.
- H001-H012, P001-P007, and W001-W002 are covered by their explicitly mapped C cards; a shared card counts once, not once per parent.
- Optional X cards do not block source-parent acceptance.
- A source parent is complete only when its required children, original prerequisite parents, target-configuration evidence, and all original acceptance clauses pass. The original backlog remains authoritative.
- Component work can proceed against approved contracts before another whole parent is finished; this removes false coding handoffs without removing live-release obligations.
- A-only completion provides a real learning asset but does not establish a native demo, uninterrupted user migration, or five-nines reliability.
- Native proof must preserve the source distinction among verification verdict, user impact, and cleanup. An expected failure can be educationally correct while still recording interrupted users.
- Unfinished functionality, unsupported platforms, proxy outage experiments, and insufficient statistical evidence remain explicitly labeled.

## Operating checks

At every replenishment:

1. Reconcile source coverage, actual card state, acceptance evidence, and the Done ledger.
2. Admit only genuinely ready cards, within queue/WIP limits and atomic Kano reservations.
3. Confirm each card's owner, small scope, fixture/host, module boundary, reviewer, and measurable check.
4. Prefer finishing/reviewing active work over starting more; inspect age, blocked time, and rework.
5. Revalidate each delighter's named six companions and same-packet provenance.
6. Publish throughput and cycle time by Kano class, not just totals; never treat planned inventory as completed value.
7. Preserve security/cost/cleanup gates even when quotas delay admission; keep unsafe live features disabled.

Creating this document completes no application, Azure resource, deployment, or implementation card. Current accepted learning deliverables and their limits are recorded separately in the [live execution ledger](flow-state.json); no parent or native proof is implied by an A-card result. The [source acceptance and evidence policy](backlog.md#completion-and-evidence-policy) and [Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer) continue to apply.
