# App Scaling Strategies

Introduction...

Implementation work is tracked in the [web demonstration harness backlog](.docs/wiki/backlog.md).

## TOC

- [Try the local demonstrations](#try-the-local-demonstrations)
- [Problem Statement](#problem-statement)
- [Scope](#scope)
- [Goal Statement](#goal-statement)
- [Scenarios](#scenarios)
- [Azure](#azure)
  - [Web Apps](#web-apps)
  - [Azure Container Apps](#azure-container-apps)
  - [Azure Kubernetes Services](#azure-kubernetes-services)
  - [Azure Function Apps](#azure-function-apps)
  - [Azure Springboot](#azure-springboot)
- [Alignment with the background](#alignment-with-the-background)
- [Key findings](#key-findings)
- [Foundational scenarios](#foundational-scenarios)
  - [Scenario 1: Warm, overlapping blue-green handoff](#scenario-1-warm-overlapping-blue-green-handoff)
  - [Scenario 2: Progressive cohort or A/B routing](#scenario-2-progressive-cohort-or-ab-routing)
- [Scenario catalog](#scenario-catalog)
  - [A. Deployment and traffic migration](#a-deployment-and-traffic-migration-strategies)
  - [B. Capacity scaling](#b-actual-capacity-scaling-strategies)
  - [C. Readiness and warm-up](#c-readiness-and-warm-up)
  - [D. Sessions, authentication, and state](#d-sessions-authentication-and-user-state)
  - [E. In-flight requests and long-lived work](#e-in-flight-requests-and-long-lived-work)
  - [F. N-tier and version compatibility](#f-n-tier-and-version-compatibility)
  - [G. Database and persistent data](#g-database-and-persistent-data-scaling)
  - [H. Caches, queues, and workers](#h-caches-queues-and-background-workers)
  - [I. State machine and orchestration](#i-state-machine-and-orchestration-correctness)
  - [J. Failure containment and rollback](#j-failure-containment-and-rollback)
  - [K. Networking, configuration, and routing](#k-networking-configuration-and-edge-routing)
  - [L. Zones, regions, and failure domains](#l-availability-zones-regions-and-failure-domains)
  - [M. Hosting-model-specific scenarios](#m-hosting-model-specific-scenarios)
  - [N. Complete end-user journeys](#n-complete-end-user-journeys)
  - [O. Demonstration and acceptance testing](#o-demonstration-and-acceptance-testing)
- [Lifecycle and safety gates](#lifecycle-and-safety-gates)
- [Acceptance and evidence](#acceptance-and-evidence)
  - [Definition of an interruption](#definition-of-an-interruption)
  - [Outcome classification](#outcome-classification)
  - [Five-nines transition metric](#five-nines-transition-metric)
  - [Statistical evidence](#statistical-evidence)
  - [Demonstration record](#demonstration-record)
- [Recommended demonstration sequence](#recommended-demonstration-sequence)
- [Microsoft Open Source Disclaimer](#microsoft-open-source-disclaimer)
- [Sources](#sources)

## Try the local demonstrations

1. Open the [local learner harness](capability/local-harness/index.html) directly in a browser. Search and filter all 150 scenarios and two guided workflows, inspect preparation and limits, then open an accepted portable lesson. The underlying [source catalog](capability/C005/index.html) is also available separately; neither view needs a server or Azure account.
2. Select an available, accepted portable lesson and conduct its synthetic controls, failure cases, and reset. The catalog explicitly identifies its historical acceptance snapshot; its availability labels are not a live feed.
3. Use the [live Kanban and accepted-demo links](.docs/wiki/kanban.md) for newer accepted work, implementation evidence, and the unblock work that gates native proof.

The [versioned getProfile fixture](capability/C020/README.md) and [isolated lesson host](capability/C041/README.md) have separate bounded, loopback-only launch and cleanup instructions. Their HTTP-backed interfaces cannot be run by simply opening their HTML files. Follow their own instructions rather than exposing the listeners publicly.

Local lessons and fixtures use synthetic data. A successful rehearsal, a documented platform capability, and a qualified native Azure result are different evidence levels. These local runs do not establish native support, production Node.js 24 validation, completed source-demo parents, or the five-nines transition goal.

The approved scope is design and local implementation only. **IaC generation, identity registration, live Azure execution, deployment, and expenditure remain unapproved.** Node.js 22.23.4 is the validated test-tooling runtime; Node.js 24 LTS with Express on App Service Linux remains the proposed production design.

## Problem Statement

Scaling Web Applications under a high available operating conditions is challenging as the amount of tolerable disruption due to swap nears 0.

## Scope

Demonstrate all the strategies to scale an n-tier, web application, with zero interruptions to the end user experience.

## Goal Statement

Swap users across application slots, with 99.999% success of achieving zero interruptions to the end user experience.

To do so, the following scenarios below have been outlined

## Scenarios

This document expands the scenarios in [background.md](background.md) into a catalog of 150 demonstration and test candidates. The goal is to preserve complete user journeys, not merely endpoint availability.

The catalog covers deployment, actual capacity scaling, n-tier compatibility, user state, and failure recovery across the hosting models in [flavors.md](flavors.md). These are proposed scenarios, not already-validated guarantees or platform SLAs.

## Azure

### Web Apps

  -Deplyment models:

    -Container

    -Code

### Azure Container Apps

### Azure Kubernetes Services

### Azure Function Apps

### Azure Springboot

## Alignment with the background

| Background element | Demonstration implication |
| --- | --- |
| Problem Statement: tolerable disruption during a swap approaches zero. | Overlap old and new capacity, control admission, preserve state, and finish or safely transfer work before retirement. |
| Scope: demonstrate strategies for scaling an n-tier web application without end-user interruptions. | Exercise frontend, API, database, cache, messaging, and worker tiers together; verify complete user journeys rather than isolated tier health. |
| Goal Statement: swap users across application slots with 99.999% success in achieving zero interruptions. | Measure actual user-transition journeys, including correctness and latency, and report interruptions and uncertainty explicitly. |

Deployment changes, capacity scaling, and failure recovery are separate axes. Moving traffic to another slot does not itself add compute, and scaling one tier can overload another.

For App Service and eligible Functions plans, "slots" means actual deployment slots. For Container Apps and AKS, demonstrate equivalent revision or deployment transitions without pretending those platforms expose App Service slots.

Before each demonstration, declare:

- Hosting model, deployment format, SKU, region, and relevant platform limits.
- User journeys, protocols, and compatibility requirements.
- Minimum, normal, and peak load, including overlapping deployment demand.
- Journey latency budgets and maximum supported request/job durations.
- Dependency capacity, data freshness, ordering, and transaction guarantees.
- Supported failure conditions and required surviving capacity.
- Drain, rollback-retention, and recovery budgets.

An unsupported combination or an outage outside the declared envelope must be reported as a limitation, not counted as a successful uninterrupted transition.

## Key findings

| Finding | Consequence |
| --- | --- |
| Deployment slots share the App Service plan's underlying instances. | Adding a slot does not add compute capacity. Reserve overlap headroom or use separate plans where necessary. Per-app placement does not create additional plan capacity. [Source][app-service-plans] |
| A successful probe alone does not establish readiness. | Validate required dependencies, effective configuration, authentication, compatible state, and journey latency. App Service swap warm-up accepts any HTTP response by default unless acceptable statuses are configured. [Source][app-service-slots] |
| Native App Service swaps recycle former production workers. | Long-running operations can be abandoned. Retaining the old slot does not prevent this recycling; use suitable draining, durable continuation, or independently controlled deployments. [Source][app-service-slots] |
| Slot-routing cookies pin clients to a destination. | Configured traffic percentages do not prove every user has moved. Observe actual cohort movement and remaining old-destination traffic. [Source][app-service-slots] |
| App Service automatic scaling and rule-based autoscale differ. | Select the supported mechanism for the workload. HTTP-based automatic scaling currently does not support deployment-slot traffic. [Source][app-service-scaling] |
| Functions slot swaps do not guarantee zero downtime. | Executing functions can terminate. Validate execution recovery and consider supported alternative update strategies rather than assuming web-app swap behavior applies. [Source][functions-slots] |
| Five-nines transition success is not five-nines uptime. | Measure whether affected user journeys complete uninterrupted across transitions, not merely whether an endpoint remains available. |

For native swap warm-up, configure an appropriate `WEBSITE_SWAP_WARMUP_PING_PATH` and explicit `WEBSITE_SWAP_WARMUP_PING_STATUSES`. A successful status must correspond to meaningful readiness; it does not replace representative journey validation.

Zero-percent traffic allocation is not an access-control boundary for a live staging endpoint. Protect candidate environments appropriately, and avoid warm-up or shadow traffic producing real duplicate side effects.

Rollback limits blast radius but cannot erase interruptions already experienced. Likewise, external routing gives additional lifecycle control but does not eliminate possible platform restarts.

## Foundational scenarios

The original two scenarios are retained in intent, with unsafe promotion and immediate termination replaced by explicit safety gates.

### Scenario 1: Warm, overlapping blue-green handoff

```gherkin
Scenario: Move users to a warmed candidate without abandoning existing work
    Given an Azure Web App has a live production deployment
        And the current and candidate deployments are independently routable
        And sufficient compute and dependency capacity exists for their overlap
    When a candidate slot or parallel deployment is provisioned
        And its endpoint and deployment identity are registered as WARMING
        And required instances, dependencies, configuration, and journeys pass readiness gates
        And its state is changed to READY
        And eligible new admissions are routed to the candidate
    Then migrated journeys preserve authentication, state, correctness, and latency budgets
        And already-admitted work finishes or continues through a tested durable handoff
        And actual routing and drain progress are verified
        And the old deployment remains available for remaining clients and required rollback
        And retirement occurs only after routing, drain, ownership, and retention gates pass
```

This scenario uses controlled routing rather than assuming a native slot swap permits application-controlled draining. S002 covers native swaps separately. Creating another slot in the same plan still requires adequate shared capacity.

### Scenario 2: Progressive cohort or A/B routing

```gherkin
Scenario: Introduce a warmed candidate through stable traffic cohorts
    Given production and candidate deployments are ready and compatible
        And session, authentication, and persistent state remain valid across both
        And sufficient capacity exists for the expected traffic distribution
    When a small stable cohort is routed to the candidate
        And actual candidate journeys are measured
        And allocation is increased only after the acceptance gates pass
    Then users remain uninterrupted during the routing transition
        And a 50/50 A/B distribution can operate while both deployments remain healthy
        And regressions stop further exposure and trigger the tested recovery path
        And interruptions already experienced remain recorded as failures
        And old-destination retirement waits for verified migration and drain completion
```

For canary migration, possible stages are 1%, 5%, 25%, 50%, and 100%; choose stages and observation windows for the workload. An ongoing A/B experiment is not evidence that every user has completed migration.

## Scenario catalog

Each row is shorthand for a Given/When/Then demonstration within the declared operating envelope. Apply the shared acceptance criteria to every applicable row.

The catalog includes successful transition paths, safe-abort tests, and negative tests that expose limits. Passing a safety-control test does not automatically establish successful user migration or five-nines reliability.

### A. Deployment and traffic-migration strategies

| ID | Scenario and required behavior |
| --- | --- |
| S001 | **Warm blue-green handoff:** Prepare green while blue serves users; migrate traffic only after readiness and compatibility validation. |
| S002 | **Prepared native slot swap:** Validate staging with target configuration, address unsupported in-flight work, and make production the swap target. |
| S003 | **Progressive canary:** Move through small traffic increments with journey-based acceptance gates before each increase. |
| S004 | **50/50 A/B operation:** Keep cohorts stable and ensure both versions preserve equivalent state and transaction semantics. |
| S005 | **Tenant-by-tenant migration:** Move one tenant at a time without splitting ownership of its state or background work. |
| S006 | **Opt-in preview:** Allow authorized selected users into the candidate without breaking login, callbacks, or normal production navigation. |
| S007 | **Session-boundary migration:** Send new sessions to green while active journeys finish on blue. |
| S008 | **Release-ring migration:** Route users through matching frontend, API, and worker versions when mixed versions are incompatible. |
| S009 | **Shadow traffic:** Replay safe traffic against green without duplicate writes, notifications, or external side effects. |
| S010 | **Feature-flag activation:** Deploy compatible code first, then enable behavior progressively without another disruptive deployment. |

### B. Actual capacity-scaling strategies

| ID | Scenario and required behavior |
| --- | --- |
| S011 | **Manual horizontal scale-out:** Add instances and verify effective capacity before increasing their traffic share. |
| S012 | **CPU/memory-driven scale-out:** Scale before resource saturation causes queuing or latency-budget violations. |
| S013 | **Concurrency/queue-driven scale-out:** Use supported workload metrics to increase capacity before excessive request accumulation. |
| S014 | **Scheduled or predictive scaling:** Provision and warm capacity before a known demand spike. |
| S015 | **Horizontal scale-in:** Use host-supported admission, drain, or continuation mechanisms to preserve work before capacity terminates. |
| S016 | **Autoscale oscillation:** Apply suitable stabilization so repeated scale-out/scale-in does not repeatedly interrupt users. |
| S017 | **Vertical scaling through replacement:** Prepare a larger parallel deployment when an in-place size change would violate continuity requirements. |
| S018 | **Independent tier scaling:** Scale the constrained tier while preserving contracts and capacity limits in remaining tiers. |
| S019 | **Cell-based expansion:** Add an isolated application cell and migrate selected tenants through controlled state and routing handoff. |
| S020 | **Quota or maximum-capacity exhaustion:** Preserve existing service using reserved capacity, block unsafe transitions, and report unsupported demand explicitly. |

### C. Readiness and warm-up

| ID | Scenario and required behavior |
| --- | --- |
| S021 | **Per-instance readiness:** Verify every required candidate instance, not whichever instance answers one endpoint probe. |
| S022 | **Dependency-aware readiness:** Validate required database, cache, messaging, and service connectivity before admitting users. |
| S023 | **Representative journey warm-up:** Exercise safe login, read, and transaction paths using isolated test fixtures. |
| S024 | **Production-configuration validation:** Confirm effective production settings work without accidentally executing production background work. |
| S025 | **Runtime and cache warm-up:** Prime JVM/JIT, application initialization, connection pools, and critical caches before exposure. |
| S026 | **Slow image pull or startup:** Keep production serving while the candidate downloads its image and initializes. |
| S027 | **False-positive health response:** Reject candidates whose probe returns an error, redirect, or misleading success response. |
| S028 | **Warm-up timeout:** Abort explicitly and leave existing production routing intact. |
| S029 | **Flapping readiness:** Require a suitable stable readiness window rather than promoting after one successful response. |
| S030 | **Warm-up overload:** Limit initialization concurrency so candidate preparation does not overwhelm shared dependencies. |

### D. Sessions, authentication, and user state

| ID | Scenario and required behavior |
| --- | --- |
| S031 | **Externalized sessions:** Preserve session state when successive requests reach different instances or deployments. |
| S032 | **Slot-routing cookie transition:** Observe and safely migrate pinned users before retiring their destination. |
| S033 | **Worker-affinity removal:** Disable instance affinity only after eliminating or safely migrating instance-local state. |
| S034 | **Authentication-key continuity:** Keep cookie/token validation compatible across deployments and planned key rotation. |
| S035 | **Login callback during cutover:** Complete an OAuth/OIDC flow started before migration without redirect loops or forced reauthentication. |
| S036 | **Existing form submission:** Accept valid anti-forgery tokens generated before migration without weakening validation. |
| S037 | **Session serialization change:** Read existing session payloads during mixed-version operation. |
| S038 | **Tenant authorization continuity:** Preserve permissions and isolation after routing changes. |
| S039 | **Instance-local temporary state:** Move required uploads, workflow state, or generated artifacts to suitable shared/durable storage. |
| S040 | **Cookie-less clients:** Preserve mobile and API-client continuity without assuming browser slot-routing cookies exist. |

### E. In-flight requests and long-lived work

| ID | Scenario and required behavior |
| --- | --- |
| S041 | **Short HTTP request at cutover:** Complete a request already admitted by the old deployment. |
| S042 | **Long-running HTTP request:** Drain within supported limits or use durable asynchronous work without losing the user's operation. |
| S043 | **Multipart upload:** Preserve uploaded parts and resume safely if ownership changes. |
| S044 | **Large download:** Preserve completion or correct range-based resumption within the accepted user-experience budget. |
| S045 | **WebSocket migration:** Preserve state and message sequencing; reconnection is seamless only if it meets agreed UX criteria. |
| S046 | **Server-sent events:** Resume from an event cursor without missing or duplicating user-visible events. |
| S047 | **gRPC streaming:** Provide application-level continuation where infrastructure cannot preserve the original stream. |
| S048 | **Batch job retirement:** Finish or checkpoint work before retiring its host. |
| S049 | **Ambiguous POST completion:** Prevent duplicate business effects when a committed request loses its response and is retried. |
| S050 | **Stale keep-alive or pinned client:** Keep the old destination usable until its remaining traffic has been accounted for. |

### F. N-tier and version compatibility

| ID | Scenario and required behavior |
| --- | --- |
| S051 | **Old frontend to new API:** Preserve contracts used by already-open browser pages. |
| S052 | **New frontend to old API:** Remain compatible while routing propagation leaves requests on the old backend. |
| S053 | **Breaking API introduction:** Use versioned endpoints or transitional adapters instead of abruptly changing a live contract. |
| S054 | **Database expand-migrate-contract:** Add compatible structures, migrate safely, and remove old structures only after old consumers disappear. |
| S055 | **Cache payload evolution:** Version or translate cached objects so mixed application versions can coexist. |
| S056 | **Event-schema evolution:** Ensure new producers remain compatible with old consumers during overlap. |
| S057 | **Static-asset versioning:** Keep assets referenced by old HTML available after deployment. |
| S058 | **Workflow/orchestration evolution:** Pin or explicitly version long-lived workflows so new code does not invalidate existing execution history. |
| S059 | **Configuration-version overlap:** Ensure old and new code interpret shared flags and configuration consistently. |
| S060 | **Rollback after schema evolution:** Preserve old-version compatibility or use explicit forward recovery when reversal is unsafe. |

### G. Database and persistent-data scaling

| ID | Scenario and required behavior |
| --- | --- |
| S061 | **Read-replica expansion:** Offload eligible reads while preserving required read-your-writes and freshness guarantees. |
| S062 | **Connection-pool multiplication:** Keep aggregate database connections within limits as frontend/API instance counts increase. |
| S063 | **Database vertical scaling:** Validate reconnects and transaction recovery; use parallel capacity if the operation exceeds interruption budgets. |
| S064 | **New shard introduction:** Copy and synchronize data before changing routing, with unambiguous write ownership. |
| S065 | **Hot-shard rebalancing:** Move tenants or partitions without missing writes or assigning two active owners. |
| S066 | **Database failover during commit:** Reconcile uncertain outcomes without applying a transaction twice. |
| S067 | **Replica lag during migration:** Route consistency-sensitive reads appropriately rather than silently returning unacceptable stale data. |
| S068 | **Index creation under load:** Use supported online operations or reject changes whose locking behavior violates user budgets. |
| S069 | **Writer handoff:** Fence the previous writer before accepting writes through the replacement. |
| S070 | **Replica restoration and promotion:** Verify synchronization through required committed data before promoting restored capacity. |

### H. Caches, queues, and background workers

| ID | Scenario and required behavior |
| --- | --- |
| S071 | **Shared-cache expansion:** Scale cache capacity while keeping application access and payload compatibility intact. |
| S072 | **Cache stampede after cutover:** Coalesce or limit refill work so cold caches do not overload the database. |
| S073 | **Cache unavailable:** Use a tested durable recovery path that meets budgets; never silently substitute empty user state. |
| S074 | **Session/cache eviction pressure:** Prevent capacity changes from unexpectedly losing required user state. |
| S075 | **Consumer scale-out:** Coordinate partitions, locks, and deduplication as additional workers begin consuming. |
| S076 | **Consumer scale-in:** Finish, renew, or safely relinquish claimed work before shutdown. |
| S077 | **Message redelivery:** Preserve one business effect even when the broker delivers a message again. |
| S078 | **Duplicate schedulers across deployments:** Use suitable ownership leases and fencing to prevent duplicate scheduled work. |
| S079 | **Backlog surge:** Add processing capacity while maintaining ordering and completion-deadline requirements. |
| S080 | **Partition reassignment:** Transfer checkpoints and ownership without missing events. |

### I. State machine and orchestration correctness

| ID | Scenario and required behavior |
| --- | --- |
| S081 | **Durable lifecycle tracking:** Record deployment identity, readiness, routing participation, draining, and retirement explicitly. |
| S082 | **Stale controller update:** Reject an old deployment epoch attempting to change current routing or readiness. |
| S083 | **Controller restart:** Resume from durable state without repeating a destructive transition. |
| S084 | **Duplicate command delivery:** Make provisioning, routing, and cleanup retries idempotent; do not accidentally perform two swaps. |
| S085 | **Concurrent deployment pipelines:** Serialize or conditionally coordinate changes to the same production destination. |
| S086 | **Expired readiness evidence:** Revalidate health before promotion when readiness information becomes stale. |
| S087 | **Partially applied routing change:** Verify effective routing and retain required old capacity until convergence is established. |
| S088 | **Permission failure:** Surface the failure and preserve existing traffic rather than reporting success. |
| S089 | **Control-plane outage:** Keep established data-plane routes serving without requiring the controller for every request. |
| S090 | **Out-of-order cleanup:** Reject retirement while traffic, work, state ownership, or rollback requirements depend on the deployment. |

### J. Failure containment and rollback

| ID | Scenario and required behavior |
| --- | --- |
| S091 | **Candidate crashes during warm-up:** Abort before exposure while production continues serving. |
| S092 | **Candidate fails during canary:** Stop further exposure and reverse routing; count interruptions already experienced. |
| S093 | **Latency regression without errors:** Reject a candidate that returns successful responses too slowly. |
| S094 | **Authentication regression:** Detect login/session failures before expanding the affected cohort. |
| S095 | **Candidate dependency partition:** Remove it from new admission and retain a usable compatible destination. |
| S096 | **Shared-plan resource contention:** Demonstrate sufficient overlap headroom or isolate deployments into separate plans. |
| S097 | **Rollback destination becomes cold:** Keep rollback capacity ready throughout its promised retention window. |
| S098 | **Rollback after new writes:** Preserve and interpret data created by the new version. |
| S099 | **Rollback command fails:** Inspect effective state and preserve known-good routing rather than blindly reversing again. |
| S100 | **Forced termination:** Verify that lost work is detected and counted, not misclassified as a successful transition. |

### K. Networking, configuration, and edge routing

| ID | Scenario and required behavior |
| --- | --- |
| S101 | **Stable public endpoint:** Keep the user-facing hostname constant while changing backend destinations. |
| S102 | **DNS-cache persistence:** Keep cached destinations usable for the required overlap period; do not assume immediate DNS convergence. |
| S103 | **TLS/certificate continuity:** Ensure every eligible destination supports the required hostname and trust configuration. |
| S104 | **Host-header and redirect differences:** Prevent warm-up success from hiding production redirect or callback failures. |
| S105 | **Non-swapped configuration:** Validate managed identity, networking, and other slot-specific properties at the effective destination. |
| S106 | **Private endpoint/private DNS:** Test the real application access path, not only an externally reachable probe. |
| S107 | **CORS differences:** Preserve browser access for existing origins throughout migration. |
| S108 | **WAF/policy differences:** Ensure valid candidate application requests and assets are not unexpectedly blocked. |
| S109 | **Outbound connection/SNAT pressure:** Maintain sufficient outbound connectivity as instance and connection counts grow. |
| S110 | **Edge configuration propagation:** Retain old origins until routing changes have converged sufficiently for safe retirement. |

### L. Availability zones, regions, and failure domains

| ID | Scenario and required behavior |
| --- | --- |
| S111 | **Single-worker loss during migration:** Surviving capacity continues serving the declared workload. |
| S112 | **Availability-zone loss:** Test supported compute/data redundancy and sufficient surviving-zone capacity. |
| S113 | **Planned regional evacuation:** Warm the destination region, synchronize required state, and migrate ownership and traffic safely. |
| S114 | **Unplanned regional failure:** Validate detection, alternate capacity, data availability, and client recovery against the agreed interruption budget. |
| S115 | **Active-passive standby:** Demonstrate that standby compute, caches, dependencies, and state are genuinely ready. |
| S116 | **Active-active regions:** Preserve declared consistency and conflict-resolution semantics while either region serves a user. |
| S117 | **Partial regional failure:** Detect dependency failures that a shallow regional HTTP probe would miss. |
| S118 | **Global routing failover:** Recover through another origin without duplicate mutations or lost session state. |
| S119 | **Regional failback:** Synchronize recovered capacity before progressively returning users. |
| S120 | **Total partition or loss of viable destinations:** Document the availability/consistency limit; do not claim an achievable zero-interruption result. |

Redundancy helps only when the surviving path has sufficient capacity and required state. It does not make arbitrary simultaneous failures harmless.

### M. Hosting-model-specific scenarios

| ID | Scenario and required behavior |
| --- | --- |
| S121 | **App Service, Windows code:** Demonstrate prepared slot swaps with strict warm-up and compatible state. |
| S122 | **App Service, Linux code:** Use a controlled deployment/swap pipeline; do not depend on unsupported native auto-swap. |
| S123 | **App Service, custom containers:** Validate immutable image deployment and initialization; native auto-swap is unsupported for Web App for Containers. |
| S124 | **App Service, separate plans:** Compare externally routed blue-green deployments with shared-plan slots for capacity isolation and lifecycle control. |
| S125 | **Container Apps, single revision:** Verify readiness-gated replacement and user continuity beyond the routing switch itself. |
| S126 | **Container Apps, multiple revisions:** Demonstrate weighted canaries, controlled retirement, and compatible rollback. |
| S127 | **AKS, rolling deployment:** Combine readiness, available surge capacity, suitable rollout availability settings, and graceful termination. |
| S128 | **AKS, blue-green/canary:** Use capable ingress, gateway, or service-mesh routing; Deployment objects alone do not supply weighted user routing. |
| S129 | **Functions, supported-plan slots:** Test interrupted execution and replay; slot swaps alone do not guarantee zero downtime. |
| S130 | **Functions, Flex Consumption:** Test rolling site updates, mixed-version compatibility, execution grace limits, and sufficient multi-instance capacity. |

Platform qualifications:

- App Service native auto-swap is unsupported for Linux web apps and Web App for Containers. Use supported controlled alternatives. [Source][app-service-slots]
- Container Apps uses revisions, not App Service slots. Single-revision mode gates replacement on readiness; multiple-revision mode provides traffic and retirement control. Neither removes the need to validate application state and active work. [Source][container-apps-revisions]
- AKS rollout settings, readiness/startup probes, surge capacity, and graceful termination serve different purposes. Pod Disruption Budgets concern voluntary eviction through the Eviction API, not arbitrary failure or every rollout operation. A `PreStop` hook consumes part of the termination grace period. [Source][aks-reliability]
- Functions slots are available only on supporting hosting plans; Functions on Container Apps uses revisions. Slot swaps can terminate executing functions. [Source][functions-slots]
- Flex Consumption does not use deployment slots. Rolling site updates have bounded execution grace periods, possible brief downtime for single-instance applications, mixed-version requirements, and platform-managed update behavior. Do not infer authoritative update completion from monitoring estimates when the platform does not expose it. [Source][functions-flex]
- Spring Boot is a runtime, not a routing primitive. Repeat relevant App Service, Container Apps, or AKS cases with JVM/bean warm-up, readiness, graceful servlet/reactive shutdown, and session compatibility. The hosting choice determines the deployment mechanism.

Verify current OS, SKU, regional availability, and platform limits before implementing each case.

### N. Complete end-user journeys

| ID | Scenario and required behavior |
| --- | --- |
| S131 | **Anonymous browsing:** Render a complete page while deployments change, including assets referenced before cutover. |
| S132 | **Sign-in in progress:** Finish authentication across the transition without requiring the user to restart. |
| S133 | **Multi-step form:** Preserve answers, validation state, and submission across deployments. |
| S134 | **Checkout/order submission:** Produce one order with the correct result despite retries or routing changes. |
| S135 | **External webhook:** Process repeated or delayed delivery without duplicate business effects. |
| S136 | **Offline mobile synchronization:** Reconcile queued operations against the new deployment without losing or duplicating changes. |
| S137 | **Cached/service-worker frontend:** Support an older client bundle talking to the new backend. |
| S138 | **Pagination across migration:** Keep cursors valid and avoid unintended missing or duplicate results. |
| S139 | **Collaborative real-time editing:** Preserve acknowledged edits, ordering, and document state during connection migration. |
| S140 | **Asynchronous report/export:** Preserve job status and artifact access when processing and download reach different deployments. |

Use isolated fixtures or appropriate sandboxes for journeys involving external side effects.

### O. Demonstration and acceptance testing

| ID | Scenario and required behavior |
| --- | --- |
| S141 | **Steady production-equivalent load:** Perform transitions continuously while measuring complete journeys. |
| S142 | **Burst during warm-up:** Test initialization and production demand competing within the declared peak-load envelope. |
| S143 | **Slow clients and network variability:** Validate latency and connection recovery under explicitly supported network conditions. |
| S144 | **Combined tier pressure:** Exercise simultaneous frontend, API, database, cache, and worker demand, not isolated benchmarks only. |
| S145 | **Repeated transitions and soak:** Detect memory leaks, connection leaks, cache growth, and degradation across many migrations. |
| S146 | **Fault injection at every phase:** Test provisioning, warming, promotion, serving, draining, rollback, and cleanup separately. |
| S147 | **Client-side correctness oracle:** Detect empty-success responses, silent logout, lost state, duplicate effects, and broken UI, not just HTTP status. |
| S148 | **Actual-migration evidence:** Trace deployment/version identity across tiers to prove users moved rather than remaining entirely on blue. |
| S149 | **Five-nines evidence:** Measure affected transitions with uncertainty and correlated-failure analysis, not a small successful sample. |
| S150 | **Post-retirement verification:** Confirm no remaining routing, sessions, jobs, artifacts, or ownership leases depend on retired capacity. |

## Lifecycle and safety gates

For deployments whose routing and retirement can be controlled, replace a standalone `warm` boolean with a durable lifecycle:

```text
CREATED -> WARMING -> READY -> CANARY -> ACTIVE -> DRAINING -> RETAINED -> RETIRED
                       \-------------> ACTIVE
```

The canary stage is optional when a supported, validated direct promotion is appropriate.

| State | Meaning and exit gate |
| --- | --- |
| CREATED | Provisioning identity and endpoint are recorded; no readiness or traffic eligibility is assumed. |
| WARMING | Initialization and validation are in progress; the candidate is not eligible for ordinary user admission. |
| READY | Fresh readiness, compatibility, and capacity evidence permit controlled admission. |
| CANARY | A bounded cohort is exposed; actual journeys are measured before further promotion. |
| ACTIVE | The deployment serves its intended eligible population with continued acceptance monitoring. |
| DRAINING | New admissions stop through supported mechanisms while remaining clients and work are accounted for. |
| RETAINED | Drain gates have passed, but ready compatible capacity/artifacts remain for the agreed rollback window. |
| RETIRED | Routing, work, ownership, and retention requirements no longer depend on the deployment. |

Additional transitions:

- `CREATED`, `WARMING`, or `READY` may become `ABORTED` before user exposure, with explicit failure evidence and safe cleanup.
- An unhealthy exposed candidate may become `QUARANTINED`; stop further exposure, execute the tested recovery path, and retain interruption records.
- `DRAINING` or `RETAINED` may return to `ACTIVE` for rollback only after fresh readiness, capacity, and compatibility validation.
- An irreversible data change may require forward recovery instead of rollback.

Track sufficient evidence for these gates, including deployment identity/epoch, endpoint, desired and effective routing, readiness freshness, available capacity, compatibility versions, remaining work, ownership/checkpoints, rollback deadline, and explicit errors.

Promotion and retirement must not rely on a stale controller command or a single successful response. If reliable platform progress is unavailable, record the uncertainty and do not manufacture a completed state.

This lifecycle does not override native swap recycling, autoscale termination, or other platform-managed behavior. Use supported host mechanisms and tested continuation strategies where application-controlled draining is unavailable.

## Acceptance and evidence

### Definition of an interruption

A recommended measurement unit is one declared user journey crossing a deployment or capacity transition. An interruption includes:

- A user-visible error, timeout, or broken required connection.
- Completion latency beyond the agreed journey budget.
- Unexpected logout, lost session/form state, or broken navigation/assets.
- Missing or duplicate business effects.
- Data freshness, ordering, or consistency outside the declared contract.

Retries or reconnects count as seamless only when correctness, state, and UX remain intact within the original journey budget. Unlimited retries or success-shaped fallbacks must not conceal failures.

### Outcome classification

| Outcome | Reporting treatment |
| --- | --- |
| Uninterrupted successful transition | Actual intended migration is evidenced and the complete journey passes all acceptance criteria. |
| Safe abort before exposure | Existing production remains usable, but no completed user migration is claimed; report deployment aborts separately. |
| Interrupted transition | Count the affected attempted journey as a failure, including failures preceding rollback. |
| Unverified or unsupported result | Report missing evidence or platform limits explicitly; do not count the result as successful. |

Users remaining entirely on the old deployment do not establish successful migration merely because their requests succeeded. Conversely, failed or uncertain started transitions must not be removed from the denominator.

### Five-nines transition metric

```text
Uninterrupted-transition success =
    uninterrupted successful transition journeys
    / all attempted transition journeys

Target >= 0.99999
Allowed interruption probability <= 0.00001
```

Define the event boundary, affected population, observation window, and outcome attribution before running the demonstration. Report by hosting model, cohort, protocol, load, and failure condition as well as in aggregate.

An empty transition sample produces no evidence, not 100% success. Endpoint uptime, request throughput, average latency, and tail percentiles are useful diagnostics but do not replace the journey-based metric.

### Statistical evidence

With zero failures in independent, comparable Bernoulli trials, the one-sided 95% upper bound on interruption probability is:

```text
p_upper = 1 - 0.05^(1/n)

n >= ceil(ln(0.05) / ln(1 - 0.00001)) = 299572
```

Thus, approximately 299,572 independent zero-failure transition trials are needed for that illustrative confidence bound. This is not a universal sample-size guarantee: users in one swap can share a correlated failure, and repeated requests from one user are not independent user transitions.

Collect representative evidence across independent rollout events and failure contexts. Analyze correlated outcomes and uncertainty rather than treating a large request count or one successful mass migration as proof of five-nines reliability.

### Demonstration record

For each applicable scenario, record:

- Scenario ID, platform/format, deployment epochs, and operating envelope.
- Preconditions, trigger, routing changes, and intended affected population.
- Client-observed journey outcomes and end-to-end tier/version evidence.
- Capacity, readiness, active-work, data-correctness, and latency observations.
- Injected failures, recovery actions, safe aborts, interruptions, and unknown outcomes.
- Effective routing and work/state ownership after rollback or retirement.
- Evidence supporting the conclusion, plus unresolved limits.

## Recommended demonstration sequence

1. **Warm handoff and controlled exposure:** S001, S003, and S004.
2. **Real capacity changes:** S011, S015, S017, and S020.
3. **Session/authentication continuity:** S031, S034, S035, and S037.
4. **Mixed-version n-tier operation:** S051, S052, S054, and S056.
5. **In-flight and long-lived work:** S041, S042, S045, and S049.
6. **Dependency and worker pressure:** S062, S066, S072, and S076.
7. **Controller recovery and rollback:** S083, S085, S087, and S098.
8. **Client-side acceptance and evidence:** S141, S145, S147, S148, S149, and S150.

Repeat the applicable cases for the hosting models and deployment formats in [flavors.md](flavors.md), using S121-S130 for platform-specific qualifications.

Expand coverage through the following matrix:

```text
Hosting model x deployment format x scaling trigger x lifecycle phase
x user state x protocol x tier compatibility x load x failure
```

Not every combination is supported. Prioritize critical interacting conditions, document exclusions, and do not infer untested combinations from unrelated successful cases.

The central strategy is overlap before handoff, compatibility during coexistence, and verified retirement afterward. Slots are one mechanism within that strategy, not by themselves a solution to zero-interruption n-tier scaling.

## Microsoft Open Source Disclaimer

The examples and guidance in this repository are provided "AS IS" for educational and demonstration purposes, without warranties or guarantees, express or implied, except as otherwise required by applicable law or binding terms. Validate their security, reliability, compatibility, and cost implications before production use.

References to Microsoft, Azure, and other Microsoft products or services are for identification and illustration only. They do not imply endorsement, sponsorship, certification, or support by Microsoft. The 99.999% transition-success target is a project goal, not a Microsoft service-level agreement or guarantee.

Microsoft and Azure are trademarks of the Microsoft group of companies. Other trademarks are the property of their respective owners.

This disclaimer is not an open-source license and does not grant rights to use, modify, or redistribute otherwise unlicensed material. It does not replace or change any applicable license, Microsoft product terms, support agreement, or published service-level agreement.

## Sources

- [What are Azure App Service plans?][app-service-plans]
- [Set up staging environments in Azure App Service][app-service-slots]
- [Automatic scaling in Azure App Service][app-service-scaling]
- [Update and deploy changes in Azure Container Apps][container-apps-revisions]
- [Deployment and cluster reliability best practices for AKS][aks-reliability]
- [Azure Functions deployment slots][functions-slots]
- [Site update strategies in Flex Consumption][functions-flex]

[app-service-plans]: https://learn.microsoft.com/azure/app-service/overview-hosting-plans
[app-service-slots]: https://learn.microsoft.com/azure/app-service/deploy-staging-slots
[app-service-scaling]: https://learn.microsoft.com/azure/app-service/manage-automatic-scaling
[container-apps-revisions]: https://learn.microsoft.com/azure/container-apps/revisions
[aks-reliability]: https://learn.microsoft.com/azure/aks/best-practices-app-cluster-reliability
[functions-slots]: https://learn.microsoft.com/azure/azure-functions/functions-deployment-slots
[functions-flex]: https://learn.microsoft.com/azure/azure-functions/flex-consumption-site-updates