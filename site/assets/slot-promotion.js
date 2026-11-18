'use strict';

(() => {
  const native = [
    ['Plan', 'Review the deployment envelope', 'Confirm compatible configuration, capacity, affected journeys and rollback authority.', '30–120 min', 'before', 'manual'],
    ['Prepare', 'Create and protect the source slot', 'Create a staging slot on a supported plan; restrict direct access and verify effective settings.', '1–10 min', 'before', 'operation'],
    ['Prepare', 'Deploy the candidate release', 'Deploy the immutable green release to staging while production continues running blue.', '1–20 min', 'before', 'operation'],
    ['Prepare', 'Verify candidate identity', 'Read the candidate release identity and check expected dependencies.', '100–2,000 ms per check', 'before', 'test'],
    ['Prepare', 'Validate candidate journeys', 'Exercise representative journeys and state compatibility before requesting the swap.', '1–30 min', 'before', 'test'],
    ['Initiate', 'Request native swap', 'Submit one swap with staging as source and production as target; the platform controls the operation.', '100–5,000 ms to submit', 'before', 'operation'],
    ['Platform preparation', 'Apply target slot settings to source', 'App Service applies applicable production settings to source instances, triggering their restart.', '1–60 s or longer', 'before', 'operation'],
    ['Platform preparation', 'Wait for source instance restarts', 'If an instance cannot restart, the platform stops the swap and reverts source changes.', '5–120 s or longer', 'before', 'operation'],
    ['Platform preparation', 'Initialize local cache if enabled', 'When configured, the platform requests the app root per source instance and local-cache initialization triggers another restart.', '5–120 s or longer; optional', 'before', 'operation'],
    ['Platform preparation', 'Warm each source instance', 'Warm-up behavior depends on configuration; configure accepted statuses and verify meaningful readiness separately.', '5–120 s or longer', 'before', 'warmup'],
    ['Cutover', 'Switch slot routing rules', 'After platform warm-up succeeds, routing switches. Production retains its identity and serves green; staging now holds blue.', 'Timing not exposed; varies', 'after', 'operation'],
    ['Platform completion', 'Apply source settings and recycle former production', 'The former production instances now in the source slot are restarted. Long-running work may be abandoned.', '5–120 s or longer', 'after', 'operation'],
    ['Verify', 'Verify production release identity', 'A completed swap command is not enough: observe green through the production endpoint.', '100–2,000 ms per check', 'after', 'test'],
    ['Verify', 'Check crossing user journeys', 'Record correctness, latency, errors and unknown outcomes; do not erase interruptions with a later rollback.', '1–30 min', 'after', 'test'],
    ['Retain', 'Keep the source slot for rollback', 'The source slot contains the previous blue release after the swap. Retain it only under the approved rollback policy.', 'Policy dependent; hours–days', 'after', 'policy'],
    ['Retire', 'Confirm release and ownership', 'Check that production serves green, the source contains the intended old release, and retention and approval gates are satisfied.', '5–30 min', 'after', 'manual'],
    ['Retire', 'Decommission the source slot', 'Only after the checks, remove the source slot if that is the approved retirement plan; never delete the production slot.', '1–10 min', 'retired', 'operation'],
    ['Retire', 'Verify final state', 'Confirm source-slot removal and healthy production journeys.', '1–10 min', 'retired', 'test']
  ];
  const managed = [
    ['Plan', 'Review run and cost', 'The workflow validates run inputs, estimate and explicit consent before the protected environment.', '1–30 min; approvals vary', 'before', 'manual'],
    ['Authorize', 'Approve the protected environment', 'An authorized operator approves the run; queue and approval time are not bounded.', 'Unbounded', 'before', 'manual'],
    ['Authorize', 'Obtain OIDC credentials', 'The workflow obtains a short-lived federated identity and signs in to Azure.', '1–30 s', 'before', 'operation'],
    ['Preflight', 'Check scope and quota', 'Verify subscription, supported region and runtime, quota, isolation and infrastructure what-if.', '30 s–5 min', 'before', 'operation'],
    ['Provision', 'Provision owned resources', 'The demo creates an isolated resource group, shared App Service plan, router, workload slots and storage.', '2–20 min or longer', 'before', 'operation'],
    ['Deploy', 'Deploy immutable releases', 'Deploy blue and green releases; the candidate endpoint must be protected.', '1–20 min', 'before', 'operation'],
    ['Baseline', 'Initialize and read routing', 'The demo writes an epoch and initial blue route, then confirms the effective controller revision.', '100–2,000 ms per operation', 'before', 'operation'],
    ['Readiness', 'Probe green dependencies', 'A green readiness response and matching release identity are checked repeatedly.', '100–2,000 ms per check', 'before', 'demoProbe'],
    ['Readiness', 'Confirm readiness gate', 'The demo requires three consecutive readiness and identity observations, not proof of every worker.', 'At least two 1 s polling intervals', 'before', 'demoReadiness'],
    ['Traffic', 'Begin crossing journeys', 'Create the affected synthetic journeys and record their baseline before changing the route.', '100 ms–several seconds', 'before', 'demoJourney'],
    ['Traffic', 'Admit old-blue work', 'The blue-green experiment admits a deliberately long request on blue and observes it is active.', '10 s admission poll budget', 'before', 'demoAdmission'],
    ['Promote', 'Read current route revision', 'The controller reads the current routing record before making the conditional update.', '100–2,000 ms', 'before', 'operation'],
    ['Promote', 'Write green route', 'The router control record changes eligible admissions to green with an expected revision.', '100–2,000 ms', 'pending', 'operation'],
    ['Promote', 'Read back effective route', 'The controller checks the route epoch, percentage and revision. A mismatch fails the gate.', '100–2,000 ms', 'moving', 'operation'],
    ['Observe', 'Finish previously admitted blue work', 'The example checks the original request completed on blue; the routing change does not itself drain it.', '2 s synthetic work delay; 5 s latency budget', 'moving', 'demoWork'],
    ['Observe', 'Finish crossing journeys on green', 'Observe actual release identities, shared state and journey outcomes; retain all interruptions and unknowns.', 'Milliseconds–minutes; workload dependent', 'moving', 'demoJourney'],
    ['Observe', 'Observe and gate the release', 'Monitor the configured observation window. On failure, stop exposure and attempt a freshly verified rollback.', '2–60 s; default 5 s', 'moving', 'demoObservation'],
    ['Drain', 'Verify no active demo requests', 'Poll blue, green and router for zero active synthetic requests; real sessions and jobs need their own checks.', '30 s poll timeout per endpoint', 'moving', 'demoDrain'],
    ['Retain', 'Preserve the rollback option', 'The demo waits 2 seconds as a short synthetic hold. Real rollback retention is separately approved.', '2 s synthetic hold', 'moving', 'demoHold'],
    ['Retire', 'Authorize owned-resource cleanup', 'Verify exact ownership, scope, retention and operator approval before removing any resource.', '5–30 min; approvals vary', 'moving', 'manual'],
    ['Retire', 'Decommission the old deployment', 'In a real controlled-routing deployment, retire only the verified old destination after drain and retention gates.', '1–10 min; varies', 'retired', 'operation'],
    ['Retire', 'Verify final state', 'Confirm removal of the intended old destination and healthy green journeys. The demo instead tears down its entire isolated resource group.', '1–10 min; varies', 'retired', 'test']
  ];
  const data = {
    native: { events: native, label: 'S002 · App Service managed swap', description: 'The platform controls slot settings, warm-up, routing-rule switch and worker recycling. Slot identities remain fixed; release contents exchange locations.', gate: 'A failed restart or warm-up stops promotion. Verify actual post-swap identities and user journeys before any retirement.' },
    managed: { events: managed, label: 'S001 · GitHub Actions + controlled routing', description: 'GitHub Actions runs the demo controller. A separate router directs users between independently reachable releases; this is not a native slot swap.', gate: 'On failed readiness or journey checks, stop exposure and attempt verified rollback. Drain and retention must be confirmed before retirement.' }
  };
  const offsets = {
    native: [0, 1800000, 1860000, 1920000, 1920100, 1980100, 1980200, 1981200, 1986200, 1991200, 1996200, 2001200, 2006200, 2006300, 2066300, 88466300, 88766300, 88826300],
    managed: [0, 60000, 90000, 91000, 121000, 241000, 301000, 301100, 303300, 305300, 305400, 305450, 305500, 305600, 307400, 307500, 307600, 309600, 311600, 313600, 613600, 673600],
    component: [0, 300000, 600000, 660000, 720000, 780000, 840000, 900000, 1200000, 1205000, 1206000, 1266000, 1326000, 1386000, 87786000, 88086000, 88146000],
    postgres: [0, 300000, 600000, 660000, 720000, 780000, 840000, 900000, 1200000, 1320000, 1321000, 1381000, 1441000, 1501000, 87901000, 88201000, 88261000]
  };
  const componentProfiles = {
    spa: {
      name: 'Front-end SPA (App Service)', router: 'SPA delivery router',
      strategy: 'Use an independently managed upstream route between two SPA destinations; retain old assets and API compatibility for existing browser tabs.',
      prepare: 'Deploy the candidate SPA to an independently reachable, protected App Service destination with immutable versioned assets.',
      compatibility: 'Keep existing browser bundles and newly loaded bundles compatible with the APIs and their old assets available.',
      readiness: 'Load candidate assets and exercise representative browser journeys against the intended APIs.',
      handoff: 'Confirm the upstream route can target both SPA destinations and account for browser and intermediary caches.',
      cutover: 'Update the separately managed SPA delivery route to the candidate. Existing tabs and cached assets need not switch immediately.',
      verify: 'Read back the routing configuration and test fresh browser requests through the public endpoint; clients can still hold old bundles.',
      drain: 'Observe active sessions and retain old assets as needed; HTTP drain alone cannot establish that all browser bundles have expired.',
      journeys: 'Check new and existing browser journeys, API compatibility, authentication and asset failures.',
      rollback: 'Verify the old SPA and its assets remain compatible with current APIs before considering route reversal.',
      retire: 'Remove only the verified old SPA destination and assets after cache, session, ownership and retention gates.',
      gate: 'Stop if either SPA version is incompatible with the live APIs or required old assets are unavailable. A route change cannot refresh every browser.'
    },
    gateway: {
      name: 'Application Gateway', router: 'Upstream gateway router',
      strategy: 'Place independently reachable blue and green gateways behind an existing upstream routing layer; changing the gateway itself is not an App Service slot swap.',
      prepare: 'Provision a separately reachable candidate gateway and protect its test entry point.',
      compatibility: 'Align listeners, TLS certificates, WAF policies, backend routes and health probes with the intended production configuration.',
      readiness: 'Exercise candidate gateway routes, TLS, WAF behavior and backend health without disturbing live traffic.',
      handoff: 'Verify an upstream router can address both gateways; account for DNS caches, session affinity and established connections.',
      cutover: 'Update the independent upstream route toward the candidate gateway. Do not assume DNS or existing connections change immediately.',
      verify: 'Read back the upstream route and probe public journeys, TLS, WAF and backend health from representative clients.',
      drain: 'Observe old-gateway connections and affinity before retirement. Backend-pool connection draining is not automatically a gateway replacement drain.',
      journeys: 'Measure errors, latency and long-lived connections through the selected gateway and backends.',
      rollback: 'Verify the old gateway, upstream route and certificates remain usable; cached routes and existing connections can delay reversal.',
      retire: 'Remove only the approved old gateway after client convergence, connection, ownership and retention gates; preserve shared backends.',
      gate: 'Stop if the candidate is unhealthy or no independent upstream route and connection-drain plan exists.'
    },
    apim: {
      name: 'API Management', router: 'Upstream API router',
      strategy: 'Illustrate independently reachable APIM instances behind an upstream router. APIM API revisions are a separate option for compatible API changes, not service slots.',
      prepare: 'Provision and secure a separately reachable candidate API Management instance.',
      compatibility: 'Align APIs, policies, authentication, certificates, products and backend routes; check consumer contract compatibility.',
      readiness: 'Exercise candidate APIs, policies, credentials, rate limits and downstream services through its test endpoint.',
      handoff: 'Verify an upstream router can address both APIM instances and plan for client connections, rate limits and cached configuration.',
      cutover: 'Update the independent upstream API route toward the candidate; do not assume all clients or connections move at once.',
      verify: 'Read back the upstream route and test API identity, authentication, policies and backends from representative clients.',
      drain: 'Observe outstanding requests and long-lived connections on the old instance before removing it.',
      journeys: 'Measure real consumer journeys and policy outcomes; retain failed and unknown outcomes.',
      rollback: 'Verify old APIM configuration, credentials and backend compatibility before any route reversal.',
      retire: 'Remove only the approved old APIM instance after clients, ownership and retention gates; preserve shared backends.',
      gate: 'Stop if candidate policies or consumer journeys fail, or if the upstream routing and rollback paths are not verified.'
    },
    bff: {
      name: 'Backend for Frontend', router: 'Upstream BFF router',
      strategy: 'Use independently reachable BFF deployments and an upstream route suited to the chosen host; sessions and API contracts must remain compatible.',
      prepare: 'Deploy an independently reachable candidate BFF using the selected host and protect its test endpoint.',
      compatibility: 'Check frontend and backend contracts, authentication, session state and retry behavior across both BFF versions.',
      readiness: 'Test candidate dependencies, session continuity and representative frontend journeys.',
      handoff: 'Confirm the upstream route can reach both BFF versions and define how in-flight requests and sessions are handled.',
      cutover: 'Update the independent upstream route to the candidate BFF without assuming existing requests move.',
      verify: 'Read back the route and observe BFF release identity, authentication and dependent-service outcomes.',
      drain: 'Allow already admitted work to finish and observe session continuity; verify application-specific drain rather than relying on a timer.',
      journeys: 'Measure existing and new frontend sessions and downstream side effects across the handoff.',
      rollback: 'Verify old BFF compatibility with current sessions, frontend bundles and downstream contracts before route reversal.',
      retire: 'Remove only the approved old BFF deployment after drain, ownership and retention gates.',
      gate: 'Stop if sessions, contracts or downstream side effects cannot be preserved across the two BFF versions.'
    },
    postgres: {
      name: 'Azure Database for PostgreSQL Flexible Server', router: 'Database client endpoint',
      strategy: 'Illustrate a planned Flexible Server read-replica promotion to primary, swapping server roles through virtual endpoints with coordinated client reconnection. Replication is asynchronous, so a write pause and explicit data-safety gates may be necessary.',
      prepare: 'Prepare a supported read replica and recovery backups; configure virtual writer and reader endpoints, matching compute, tier, storage size and required shared-memory settings.',
      compatibility: 'Check schema and application compatibility, replication health and lag. A read replica is not a writable candidate.',
      readiness: 'Validate replica reads, replication progress and recovery procedures without writing to the read-only replica.',
      handoff: 'Pause or fence writers, account for in-flight transactions and confirm replication health and lag. Stop if a safe single-writer handoff cannot be established.',
      cutover: 'Request planned promotion to primary. The service synchronizes pending logs and swaps server roles; clients must reconnect through the writer endpoint. A write interruption may be unavoidable.',
      verify: 'Verify the effective primary, safe representative reads and writes, connection pools and application identities before resuming normal writes.',
      drain: 'Reconcile in-flight and unknown transaction outcomes; verify the former primary is now a read replica and avoid blind retries of non-idempotent writes.',
      journeys: 'Verify committed data, application transactions and client-observed errors or unknown outcomes across the change.',
      rollback: 'Assess data divergence and the approved recovery plan. Do not simply point writers back to a potentially stale former primary.',
      retire: 'Retire the former primary, now a read replica, only after data, backup, ownership and recovery gates; assess the loss of that replica before removing it.',
      gate: 'Stop if writer fencing, planned synchronization, recovery or a single-writer guarantee cannot be verified. Replication is asynchronous; forced promotion can lose data.'
    },
    redis: {
      name: 'Azure Managed Redis', router: 'Cache client endpoint',
      strategy: 'Illustrate a client-side cache endpoint handoff. This example assumes cache data can be regenerated; sessions, locks, queues or other authoritative data require a separate migration plan.',
      prepare: 'Provision and secure a candidate cache with compatible networking, authentication, capacity and eviction settings.',
      compatibility: 'Inventory keys, TTLs and consumers. Do not assume the cache is disposable if it contains sessions, locks, queues or authoritative state.',
      readiness: 'Test client connections and warm safely regenerable entries while checking backend capacity for cache misses.',
      handoff: 'Plan client endpoint changes, connection-pool reconnection, key versioning and invalidation; stop if state cannot safely be regenerated or migrated.',
      cutover: 'Change the configured cache endpoint for the affected clients and reconnect pools; coordinate writes and invalidation to avoid stale divergent caches.',
      verify: 'Observe client connections, cache errors, misses and data correctness against the durable source where applicable.',
      drain: 'Track old client connections and in-flight commands; do not assume changing configuration moves every client immediately.',
      journeys: 'Check user sessions, misses, latency and backend load without treating the cache as the only copy of durable data.',
      rollback: 'Check for divergent keys and client configuration before reconnecting to the previous cache; a simple endpoint reversal can serve stale state.',
      retire: 'Remove only the approved old cache after client, data-semantics, ownership and retention gates.',
      gate: 'Stop if cache contents are authoritative or cannot be safely migrated, or if client convergence and stale-data behavior are unknown.'
    }
  };
  function componentEvents(profile) {
    return [
      ['Plan', 'Define interruption and ownership gates', 'Identify the target, affected clients, acceptable interruption, owner and recovery authority.', '5–30 min', 'before', 'manual'],
      ['Prepare', 'Prepare candidate component', profile.prepare, '5–120 min or longer', 'before', 'operation'],
      ['Prepare', 'Verify compatibility', profile.compatibility, '1–30 min or longer', 'before', 'test'],
      ['Prepare', 'Protect candidate access', 'Restrict the candidate entry point and verify that tests cannot create unintended production side effects.', '1–10 min', 'before', 'operation'],
      ['Readiness', 'Validate candidate readiness', profile.readiness, '1–30 min or longer', 'before', 'test'],
      ['Observe', 'Record existing behavior', 'Capture blue identity, representative journeys, errors and in-flight work before changing the destination.', '1–10 min', 'before', 'test'],
      ['Gate', 'Prepare safe handoff', profile.handoff, '1–30 min or longer', profile === componentProfiles.postgres ? 'fenced' : 'before', 'test'],
      ['Promote', 'Authorize handoff', 'Confirm the readiness, compatibility, ownership and recovery gates before requesting the change.', '5–30 min; approvals vary', profile === componentProfiles.postgres ? 'fenced' : 'before', 'manual'],
      ['Promote', 'Change the destination', profile.cutover, profile === componentProfiles.postgres ? 'About 1–3 min; lag dependent' : 'Seconds–minutes or longer; varies', 'pending', 'operation'],
      ['Verify', 'Verify the effective destination', profile.verify, '100–2,000 ms per check; convergence varies', 'moving', 'test'],
      ['Drain', 'Reconcile old connections and work', profile.drain, '1–30 min or longer', 'moving', 'test'],
      ['Verify', 'Check crossing journeys', profile.journeys, '1–30 min or longer', 'moving', 'test'],
      ['Retain', 'Assess rollback safety', profile.rollback, '1–30 min or longer', 'moving', 'test'],
      ['Retain', 'Keep the previous destination', 'Keep the previous component only under its approved retention and recovery policy; a hold alone does not prove rollback is safe.', 'Policy dependent; hours–days', 'moving', 'policy'],
      ['Retire', 'Approve old component retirement', 'Verify the exact old resource, owner, evidence and approvals; do not remove shared dependencies.', '5–30 min; approvals vary', 'moving', 'manual'],
      ['Retire', 'Decommission the old component', profile.retire, '1–30 min or longer', 'retired', 'operation'],
      ['Retire', 'Verify final state', 'Confirm only the approved old component was removed and the new destination and representative journeys remain healthy.', '1–10 min', 'retired', 'test']
    ];
  }
  const timingControls = {
    manual: ['Not directly configurable', 'Operator and queue elapsed time varies. Schedules or approval policies can be defined, but they do not fix completion time.', 'Illustrative estimate'],
    operation: ['Not directly configurable', 'The elapsed service or control-plane operation is not a duration setting. A configured timeout can limit waiting, not guarantee completion.', 'Illustrative estimate'],
    test: ['Test policy configurable', 'A deployment test can set its own observation window or deadline; actual check and journey durations vary. This page does not configure the test.', 'Illustrative estimate'],
    warmup: ['Not directly configurable', 'App Service warm-up path and accepted statuses can be configured, but they do not set the actual warm-up or restart duration.', 'Illustrative estimate'],
    policy: ['Retention policy configurable', 'Choose an approved rollback hold in the release process. The hold does not replace readiness, ownership or retirement gates.', 'Illustrative policy example'],
    demoProbe: ['Demo budget fixed in code', 'The demo uses a 2 s request latency budget; actual check duration varies. This is not a workflow input or a 2 s network-abort timeout.', 'Illustrative estimate'],
    demoReadiness: ['Fixed in demo code', 'The demo requires three consecutive checks, with 1 s polling intervals and a 10 min readiness timeout. These are not workflow inputs.', 'Demo code settings'],
    demoJourney: ['Demo budgets fixed in code', 'The demo uses a 2 s request latency budget and a 10 min journey budget. Actual completion time varies; these budgets are not workflow inputs.', 'Illustrative estimate'],
    demoAdmission: ['Fixed in demo code', 'The demo polls for admitted work with a 10 s budget and 50 ms interval. Actual admission may occur earlier; these are not workflow inputs.', 'Demo code setting'],
    demoWork: ['Fixed in demo code', 'The synthetic work delay and its latency budget are fixed in the demo; the budget is not a network-abort timeout. Neither is a workflow input.', 'Demo code settings'],
    demoObservation: ['Configurable workflow input', 'Set observation_seconds to 2–60 s when launching the demo workflow; its default is 5 s. The example offsets assume 2 s. Changing this page does not change the workflow.', 'Workflow input'],
    demoDrain: ['Fixed in demo code', 'The demo uses a 30 s polling timeout per endpoint and a 500 ms interval. The actual drain may finish earlier; these are not workflow inputs.', 'Demo code setting'],
    demoHold: ['Fixed demo; policy configurable', 'The demo hold is fixed at 2 s in code, not a workflow input. Production rollback retention is a separate operator-defined policy.', 'Demo code setting']
  };
  const el = id => document.getElementById(id);
  let mode = 'native', index = 0, timer = null;
  const format = ms => `T+${(ms / 1000).toFixed(3)} s`;
  const component = id => el(`architecture-${id}`).checked;
  const isMicroservice = target => /^[1-3]$/.test(target);
  const targetValue = () => el('architecture-target').value;
  const targetName = target => isMicroservice(target) ? `Microservice ${target}` : componentProfiles[target].name;
  const supportsNative = target => isMicroservice(target) || target === 'spa'
    || (target === 'bff' && el('architecture-bff-host').value === 'appservice');
  const componentData = Object.fromEntries(Object.entries(componentProfiles).map(([id, profile]) => [id, {
    events: componentEvents(profile),
    offsets: id === 'postgres' ? offsets.postgres : offsets.component,
    label: `Controlled handoff · ${profile.name}`,
    description: `Illustrative GitHub Actions design for ${profile.name}; this handoff is not implemented by the demo and does not execute here. ${profile.strategy}`,
    gate: profile.gate
  }]));
  function activeScenario() {
    const target = targetValue();
    return mode === 'managed' && !isMicroservice(target)
      ? componentData[target]
      : { ...data[mode], offsets: offsets[mode] };
  }
  const wiring = [
    ['spa', 'API called by the SPA'],
    ['gateway', 'API through Application Gateway'],
    ['apim', 'API through API Management'],
    ['bff', 'API through BFF'],
    ['postgres', 'Connect PostgreSQL'],
    ['redis', 'Connect Redis']
  ];

  function createWiringControls() {
    for (let n = 1; n <= 3; n++) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'service-wiring';
      fieldset.id = `service-connections-${n}`;
      const legend = document.createElement('legend');
      legend.textContent = `Microservice ${n} connections`;
      const choices = document.createElement('div');
      choices.className = 'component-options';
      for (const [id, text] of wiring) {
        const label = document.createElement('label');
        label.dataset.component = id;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `wire-${n}-${id}`;
        input.checked = id === 'postgres' || id === 'redis' ? n === 1 : true;
        label.append(input, document.createTextNode(` ${text}`));
        choices.append(label);
      }
      fieldset.append(legend, choices);
      el('service-connections').append(fieldset);
    }
  }

  function syncWiringControls() {
    const count = Number(el('architecture-services').value);
    const target = el('architecture-target');
    for (const option of target.options) {
      const available = isMicroservice(option.value) ? Number(option.value) <= count : component(option.value);
      option.hidden = option.disabled = !available;
    }
    if (!target.value || target.selectedOptions[0].disabled) target.value = '1';
    el('spa-gateway-option').hidden = !(component('spa') && component('gateway'));
    el('bff-order-option').hidden = !(component('apim') && component('bff'));
    el('bff-host-option').hidden = !component('bff');
    for (let n = 1; n <= 3; n++) {
      const fieldset = el(`service-connections-${n}`);
      fieldset.hidden = n > count || !wiring.some(([id]) => component(id));
      for (const label of fieldset.querySelectorAll('label[data-component]')) {
        label.hidden = !component(label.dataset.component);
      }
    }
  }

  function syncCapability() {
    const target = targetValue();
    const available = supportsNative(target);
    el('promotion-capability').textContent = available
      ? `Native swap models ${targetName(target)} as an App Service app on a slot-capable plan; confirm the actual host, SKU and settings. The controlled handoff is a separate option.`
      : target === 'bff'
        ? 'Native App Service swap is unavailable while the BFF host is unspecified. Select an App Service host to compare it; otherwise use the controlled handoff.'
        : `${targetName(target)} does not use App Service deployment slots. The controlled handoff is a component-specific illustration, not an App Service swap.`;
    document.querySelector('[data-mode="native"]').disabled = !available;
    return available;
  }

  const connected = (n, id) => component(id) && el(`wire-${n}-${id}`).checked;

  function renderArchitecture() {
    const [phase, , , , state] = activeScenario().events[index];
    const count = Number(el('architecture-services').value);
    const target = targetValue();
    const targetIsMicroservice = isMicroservice(target);
    const services = Array.from({ length: count }, (_, i) => i + 1);
    const serviceName = n => `Microservice ${n}`;
    const spa = component('spa');
    const spaGateway = spa && component('gateway') && el('wire-spa-gateway').checked;
    const using = id => services.filter(n => connected(n, id));
    const paths = el('architecture-paths');
    const checks = el('architecture-checks');
    paths.replaceChildren();
    checks.replaceChildren();
    el('architecture-summary').textContent = `${targetName(target)} is the promotion target. `
      + (count > 1 ? 'The selected microservices have independently modeled paths. ' : '')
      + 'Only the target’s old deployment is eligible for retirement in this model; confirm real ownership and dependencies. Paths reflect your example connections, not discovered Azure configuration; service-to-service calls are not shown.';

    function path(label, hops) {
      const heading = document.createElement('strong');
      heading.textContent = label;
      const list = document.createElement('ol');
      list.className = 'architecture-path';
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', label);
      for (const [i, hop] of hops.entries()) {
        const item = document.createElement('li');
        if (i > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'architecture-arrow';
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = '→';
          item.append(arrow);
        }
        const node = document.createElement('span');
        node.className = 'node';
        node.textContent = hop;
        item.append(node);
        list.append(item);
      }
      paths.append(heading, list);
    }

    const routing = target === 'postgres'
      ? state === 'before' ? 'Blue primary' : state === 'fenced' ? 'Blue primary; writes fenced'
        : state === 'pending' ? 'Promotion pending verification; writes fenced' : 'Green primary verified; clients may lag'
      : state === 'before' ? 'Blue live'
        : state === 'pending' ? 'Update written; read-back pending'
        : mode === 'managed' && !targetIsMicroservice ? 'Green destination verified; clients may lag'
        : mode === 'managed' && phase === 'Drain' ? 'Green live; verify blue drain'
        : mode === 'managed' && state === 'moving' && phase !== 'Retire' && phase !== 'Retain' ? 'Green live; blue available'
        : 'Green live';
    const routeName = mode === 'native' ? 'App Service slot routing'
      : target === 'postgres' ? 'Database endpoint / writer control'
      : target === 'redis' ? 'Cache client endpoint'
      : targetIsMicroservice ? 'Controlled router' : 'Upstream controlled router';
    const promotionHop = `${routeName} (${routing})`;
    const through = (id, name) => target === id ? [promotionHop, name] : [name];
    if (spa) path('SPA delivery', ['Browser', ...(spaGateway ? through('gateway', 'Application Gateway') : []),
      ...through('spa', 'Front-end SPA (App Service)')]);
    for (const n of services) {
      const apim = connected(n, 'apim') ? through('apim', 'API Management (APIM)') : [];
      const bff = connected(n, 'bff') ? through('bff', 'Backend for Frontend (BFF)') : [];
      const apiLayers = el('architecture-bff-order').value === 'before' ? [...bff, ...apim] : [...apim, ...bff];
      path(`API path to ${serviceName(n)}`, [connected(n, 'spa') ? 'Browser running SPA' : spa ? 'Other client' : 'Client',
        ...(connected(n, 'gateway') ? through('gateway', 'Application Gateway') : []), ...apiLayers,
        ...(String(n) === target ? [promotionHop] : []), serviceName(n)]);
      if (connected(n, 'postgres')) path(`PostgreSQL path from ${serviceName(n)}`,
        [serviceName(n), ...through('postgres', 'Azure Database for PostgreSQL (persistent)')]);
      if (connected(n, 'redis')) path(`Redis path from ${serviceName(n)}`,
        [serviceName(n), ...through('redis', 'Azure Managed Redis (cache)')]);
    }

    const unlinked = wiring.filter(([id]) => id !== 'spa' && component(id) && using(id).length === 0 && !(id === 'gateway' && spaGateway))
      .map(([id]) => ({ gateway: 'Application Gateway', apim: 'API Management', bff: 'BFF', postgres: 'PostgreSQL', redis: 'Redis' })[id]);
    const targetUnlinked = !targetIsMicroservice && target !== 'spa'
      && using(target).length === 0 && !(target === 'gateway' && spaGateway);
    if (targetUnlinked) {
      path('Unlinked promotion target', [promotionHop, `${targetName(target)} (no modeled connection)`]);
    }
    el('gate').textContent = activeScenario().gate + (targetUnlinked
      ? ' The target has no modeled connection; identify its consumers before planning a real handoff.'
      : '');
    el('unlinked-components').textContent = unlinked.length
      ? `Selected but not connected to a shown path: ${unlinked.join(', ')}. Add a connection above if needed.`
      : '';

    const retiring = phase === 'Retire';
    const crossing = state !== 'before' && state !== 'fenced';
    const notes = [
      retiring ? `Retire only the approved old ${targetName(target)} in this example; verify ownership before changing any other component.`
        : state === 'pending' ? `Verify the effective destination before treating the candidate ${targetName(target)} as live.`
        : state === 'fenced' ? 'Keep PostgreSQL writers fenced and account for in-flight transactions until the safe handoff is verified.'
        : crossing ? `Verify the live ${targetName(target)} and the selected paths.`
        : `Prepare ${targetName(target)} as the promotion target and check the selected paths before cutover.`
    ];
    if (targetUnlinked) notes.push('No consumers are connected to the promotion target in this example; add a path or verify its real consumers.');
    if (!targetIsMicroservice && mode === 'managed') notes.push(componentProfiles[target].gate);
    if (count > 1) notes.push('Check compatibility with the other selected services and their independent release lifecycles.');
    if (spa) notes.push(targetIsMicroservice && !connected(Number(target), 'spa')
      ? 'Verify SPA bundle delivery; no SPA call to the promotion target is modeled.'
      : 'Check that existing browser bundles and newly loaded bundles remain compatible with the selected APIs.');
    if (spaGateway || using('gateway').length || using('apim').length) notes.push(
      'Check selected ingress and API routes, health checks where applicable, and authentication through the public endpoint.');
    if (using('bff').length) notes.push('Verify BFF request contracts and session continuity for the modeled paths.');
    if (using('postgres').length && target !== 'postgres') notes.push(targetIsMicroservice && connected(Number(target), 'postgres')
      ? 'Keep PostgreSQL schema and data compatible with both target releases through rollback; do not retire the database with the old deployment.'
      : 'Verify PostgreSQL compatibility for the services connected to it.');
    if (using('redis').length && target !== 'redis') notes.push(targetIsMicroservice && connected(Number(target), 'redis')
      ? 'Verify Redis key and value compatibility across target releases, and that a cache miss does not lose durable data.'
      : 'Verify Redis compatibility for the services connected to it.');
    for (const note of notes) {
      const item = document.createElement('li');
      item.textContent = note;
      checks.append(item);
    }

    const timing = el('component-timing');
    timing.replaceChildren();
    function timingRow(name, configurable, notDirect) {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = name;
      const setting = document.createElement('td');
      setting.textContent = configurable;
      const elapsed = document.createElement('td');
      elapsed.textContent = notDirect;
      row.append(heading, setting, elapsed);
      timing.append(row);
    }
    function linkStatus(id) {
      const names = using(id).map(serviceName);
      if (id === 'gateway' && spaGateway) names.unshift('SPA delivery');
      return names.length ? ` — ${names.join(', ')}` : ' — no modeled connection';
    }
    if (supportsNative(target)) timingRow(mode === 'native' ? 'App Service native swap' : 'App Service target hosting',
      mode === 'native'
        ? 'Configure the warm-up path and accepted statuses; choose test and rollback-retention windows in your release process. The warm-up settings are not durations.'
        : 'Choose application readiness, test and rollback-retention policies. Native swap warm-up settings apply only when performing a swap.',
      mode === 'native'
        ? 'Actual setting propagation, warm-up, route switch and worker-recycle times are platform-dependent.'
        : 'Actual deployment, instance startup and platform-recycle times are not directly set by those policies.');
    if (mode === 'managed') {
      if (targetIsMicroservice) {
        timingRow('GitHub Actions demo controller',
          'Workflow input observation_seconds: 2–60 s, default 5 s. Production observation and retention policies are separately chosen.',
          'Demo readiness, drain and 2 s retention limits are fixed in source, not workflow inputs. Actual operation and queue times vary.');
      } else {
        timingRow('GitHub Actions — illustrative handoff',
          'Choose observation, approval and retention policies in your own workflow. This component handoff is not implemented by the demo.',
          'Actual resource changes, client convergence, replication and queue times are not set by those policies.');
      }
    }
    const targetSuffix = id => target === id ? ' — promotion target' : '';
    if (spa) timingRow(`Front-end SPA${targetSuffix('spa')} — ${using('spa').length ? `API calls to ${using('spa').map(serviceName).join(', ')}` : 'no modeled API calls'}`,
      'Client request deadlines, if implemented, and HTTP asset-cache freshness policy.',
      'Actual browser download, rendering and API response times vary.');
    if (component('gateway')) timingRow(`Application Gateway${targetSuffix('gateway')}${linkStatus('gateway')}`,
      'Backend HTTP request timeout: 1–240 s for external or 1–86,400 s for private backends. Connection-draining timeout: 1–3,600 s for deregistered pool members.',
      'Actual response or drain time is not set by the timeout; backend removal and draining do not automatically follow a native slot swap.');
    if (component('apim')) timingRow(`API Management${targetSuffix('apim')}${linkStatus('apim')}`,
      'The forward-request timeout (seconds) or timeout-ms (milliseconds) limits the wait for backend response headers.',
      'Actual backend and gateway latency is not fixed by the timeout; values over 240 s may not be honored because of network idle limits.');
    if (component('bff')) timingRow(`Backend for Frontend${targetSuffix('bff')}${linkStatus('bff')}`,
      'Application-defined request deadlines, retry delays and session expiry, if implemented.',
      'Actual processing and downstream response times depend on the application and its dependencies.');
    for (const n of services) timingRow(`${serviceName(n)}${String(n) === target ? ' — promotion target' : ''}`,
      'Application request deadlines, retry delays and health-check policies, if implemented.',
      String(n) === target ? 'Actual deployment, warm-up and cutover time is not set by those limits.' : 'Actual request and deployment times vary independently.');
    if (component('postgres')) timingRow(`Azure Database for PostgreSQL${targetSuffix('postgres')}${linkStatus('postgres')}`,
      'Where supported, configure statement_timeout at an appropriate database, role or session scope. Values without units are milliseconds; zero disables it.',
      'Actual query or schema-migration time varies; a timeout can cancel work rather than make it complete sooner.');
    if (component('redis')) timingRow(`Azure Managed Redis${targetSuffix('redis')}${linkStatus('redis')}`,
      'Configure client connect/command timeouts and retry delays; set key TTLs if the application uses them.',
      'Actual command latency and reconnect or failover time vary; client timeouts do not guarantee success.');
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    el('play').textContent = '▶ Play';
  }
  function render() {
    const config = activeScenario(), event = config.events[index];
    const [phase, title, detail, duration, state, timingKey] = event;
    const pending = state === 'pending', before = state === 'before' || state === 'fenced';
    const after = !before && !pending, retired = state === 'retired';
    const [controlLabel, controlDetail, provenance] = timingControls[timingKey];
    const nativeMode = mode === 'native';
    const target = targetValue();
    const profile = isMicroservice(target) ? null : componentProfiles[target];
    const dataTarget = target === 'postgres' || target === 'redis';
    el('method-description').textContent = config.description;
    el('phase').textContent = config.label + ' / ' + phase;
    el('event-title').textContent = title;
    el('event-detail').textContent = detail;
    el('offset').textContent = format(config.offsets[index]);
    el('duration').textContent = `${provenance}: ${duration}`;
    el('event-timing-control').textContent = `${controlLabel}. ${controlDetail}`;
    el('gate').textContent = config.gate;
    el('client-label').textContent = dataTarget ? 'Services' : 'Users';
    el('client-name').textContent = dataTarget ? 'Client connections' : 'Stable endpoint';
    el('client-detail').textContent = dataTarget ? 'Affected applications and in-flight work' : 'Representative journeys';
    el('router-label').textContent = nativeMode ? 'App Service routing' : profile ? profile.router : 'Controlled router';
    el('router-detail').textContent = nativeMode ? 'Production hostname stays fixed'
      : pending ? 'Change pending verification' : profile ? 'Verify destination and client convergence' : 'Stable endpoint; verified route';
    el('old-name').textContent = nativeMode ? 'Production slot' : 'Previous destination';
    el('new-name').textContent = nativeMode ? 'Source / staging slot' : 'Candidate destination';
    const nativeReleaseName = isMicroservice(target) ? targetName(target) : componentProfiles[target].name;
    const componentKind = { spa: 'SPA release', gateway: 'gateway', apim: 'APIM instance', bff: 'BFF deployment', redis: 'cache' }[target];
    el('old-release').textContent = target === 'postgres' && !nativeMode ? pending ? 'Blue primary (last verified)' : after ? 'Blue read replica' : 'Blue primary'
      : nativeMode ? `${nativeReleaseName} — ${after ? 'Green' : 'Blue'} release`
        : componentKind ? `Blue ${componentKind}` : 'Blue release';
    el('new-release').textContent = target === 'postgres' && !nativeMode ? pending ? 'Green read replica (last verified)' : after ? 'Green primary' : 'Green read replica'
      : nativeMode ? `${nativeReleaseName} — ${after ? 'Blue' : 'Green'} release`
        : componentKind ? `Green ${componentKind}` : 'Green release';
    if (target === 'postgres' && !nativeMode) {
      el('old-state').textContent = retired ? 'Retired after gates' : state === 'fenced' || pending ? 'Writes fenced; handoff not yet verified'
        : after ? 'Read replica; not a writer' : 'Serving reads and writes';
      el('new-state').textContent = pending ? 'Promotion pending verification' : after ? 'Primary verified; clients may lag'
        : state === 'fenced' ? 'Read-only; final sync gate' : index === 0 ? 'Planned replica' : 'Read-only candidate / replica';
    } else {
      el('old-state').textContent = nativeMode ? 'Production traffic' : pending ? target === 'redis' ? 'Client endpoint update unconfirmed' : 'Routing update unconfirmed'
        : retired ? 'Retired after gates' : after ? profile ? 'Retained; assess rollback' : 'Existing work / rollback' : 'Serving production';
      el('new-state').textContent = nativeMode
        ? retired ? 'Removed after gates' : after ? index === 10 ? 'Old release; recycle follows' : 'Old release retained; workers recycled' : index < 2 ? 'Planned source slot' : 'Candidate / warm-up'
        : pending ? profile ? target === 'redis' ? 'Client endpoint change pending verification' : 'Change requested; verification pending' : 'Route written; read-back pending'
          : after ? profile ? 'Verified; clients may lag' : 'Serving production' : index < 2 ? 'Planned candidate' : 'Candidate / validation';
    }
    el('old-node').className = 'node destination' + (nativeMode || before ? ' active' : retired ? ' retired' : '');
    el('new-node').className = 'node destination' + (!nativeMode && after ? ' active' : nativeMode && retired ? ' retired' : '');
    el('diagram-state').textContent = `${el('old-name').textContent}: ${el('old-release').textContent}, ${el('old-state').textContent}. ${el('new-name').textContent}: ${el('new-release').textContent}, ${el('new-state').textContent}.`;
    el('counter').textContent = `Event ${index + 1} of ${config.events.length}`;
    el('previous').disabled = index === 0;
    el('next').disabled = index === config.events.length - 1;
    renderArchitecture();
    document.querySelectorAll('.event-table button').forEach(button => {
      if (Number(button.dataset.index) === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  function build() {
    const config = activeScenario();
    const rows = config.events.map((event, i) => {
      const row = document.createElement('tr');
      const offset = document.createElement('td');
      const action = document.createElement('td');
      const time = document.createElement('td');
      const control = document.createElement('td');
      const button = document.createElement('button');
      offset.textContent = format(config.offsets[i]);
      button.type = 'button'; button.dataset.index = i; button.textContent = event[1];
      button.addEventListener('click', () => { stop(); index = i; render(); });
      action.append(button);
      time.textContent = `${timingControls[event[5]][2]}: ${event[3]}`;
      control.textContent = timingControls[event[5]][0];
      row.append(offset, action, time, control);
      return row;
    });
    el('events').replaceChildren(...rows);
    syncCapability();
    document.querySelectorAll('.mode').forEach(button => {
      const selected = button.dataset.mode === mode;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('btn', selected);
    });
    render();
  }
  document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => {
    if (button.disabled) return;
    stop(); mode = button.dataset.mode; index = 0; build();
  }));
  createWiringControls();
  syncWiringControls();
  let lastTarget = targetValue();
  el('architecture-options').addEventListener('change', () => {
    syncWiringControls();
    const target = targetValue();
    const nativeAvailable = syncCapability();
    const modeChanged = mode === 'native' && !nativeAvailable;
    if (modeChanged) mode = 'managed';
    if (modeChanged || target !== lastTarget) {
      stop(); index = 0; build();
    } else {
      renderArchitecture();
    }
    lastTarget = target;
  });
  el('previous').addEventListener('click', () => { stop(); if (index > 0) index--; render(); });
  el('next').addEventListener('click', () => { stop(); if (index < activeScenario().events.length - 1) index++; render(); });
  el('play').addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    if (index === activeScenario().events.length - 1) { index = 0; render(); }
    el('play').textContent = '❚❚ Pause';
    timer = setInterval(() => {
      index++; render();
      if (index === activeScenario().events.length - 1) stop();
    }, 2000);
  });
  build();
})();
