(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C003Matrix', { value: factory() });
}(globalThis, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function fact(id, text, sourceIds) { return { id, text, sourceIds }; }
  function row(values) {
    return Object.assign({
      runtime: 'unselected', os: 'unspecified', adapter: 'planned', qualified: false,
      nativeEvidence: [], firstPlannedNativeTarget: false
    }, values);
  }
  const sharedCompute = fact('shared-compute',
    'Slots share the App Service plan instances. Adding a slot does not add compute; reserve overlap headroom or consider separate plans.',
    ['app-service-plans', 'app-service-slots']);
  const strictWarmup = fact('strict-warmup',
    'Swap warm-up accepts any HTTP response by default. Set WEBSITE_SWAP_WARMUP_PING_PATH and explicit WEBSITE_SWAP_WARMUP_PING_STATUSES; validate dependencies, configuration, authentication, state, and journey latency.',
    ['app-service-slots']);
  const slotLifecycle = fact('slot-lifecycle',
    'Native swaps can recycle former production workers and abandon long work. Routing cookies can pin clients; configured traffic weights are not proof that all users moved. A zero-percent staging allocation is not access control.',
    ['app-service-slots']);
  const noAutoSwap = fact('no-linux-container-auto-swap',
    'Native auto-swap is unsupported for Linux web apps and Web App for Containers. Use a supported controlled deployment/swap path instead.',
    ['app-service-slots']);
  const automaticScaling = fact('automatic-scaling-slot-traffic',
    'HTTP-based App Service automatic scaling does not support deployment-slot traffic. Rule-based autoscale is a different mechanism; traffic movement is not capacity scaling.',
    ['app-service-scaling']);
  const revisionNotSlot = fact('revisions-not-slots',
    'Container Apps uses immutable revisions, not App Service deployment slots. Readiness-gated routing does not prove application-state or active-work continuity.',
    ['container-apps-revisions']);
  const aksReadiness = fact('aks-rollout-readiness',
    'Readiness/startup probes, available surge capacity, rollout availability, and graceful termination serve different purposes. A PreStop hook consumes part of the termination grace period.',
    ['aks-reliability']);
  const pdbScope = fact('pdb-eviction-scope',
    'Pod Disruption Budgets cover voluntary disruption through the Eviction API, not arbitrary failure or every rollout operation. They are not universal failure protection.',
    ['aks-reliability']);
  const gatewayScope = fact('routing-controller-required',
    'Deployment objects alone do not provide weighted user routing. Select and qualify a capable ingress, gateway, or service mesh and version-specific backends; do not assume installed gateway availability.',
    ['aks-reliability']);
  const functionSlots = fact('functions-slot-plan-limits',
    'Deployment slots require a supporting Consumption, Premium, or Dedicated hosting plan and its plan-specific slot limits. Flex Consumption has no slots. A swap can terminate executing functions; durable/checkpointed recovery must be verified. Functions on Container Apps uses revisions instead.',
    ['functions-slots']);
  const flexLimits = fact('flex-update-limits',
    'Flex Consumption has no deployment slots. Recreate is the default site-update strategy; RollingUpdate drains/replaces in batches, subject to bounded execution grace and mixed-version requirements. Single-instance continuity is not guaranteed. There is no built-in rollback; redeploy a prior version. KQL progress estimates are not authoritative completion.',
    ['functions-flex', 'functions-slots']);

  /** @type {import('./matrix-contract').CapabilityMatrix} */
  const matrix = {
    schemaVersion: '1.0.0',
    kind: 'host-format-capability-matrix',
    cardId: 'C003',
    scope: 'local-documented-only',
    provenance: {
      baselineCommit: 'a1411c1fd7b081e7772db0ac96eb61d697452c86',
      readmePath: 'README.md',
      backlogPath: '.docs\\wiki\\backlog.md',
      approvalArtifact: 'capability\\C001\\approved-contract.js',
      approvalSourceCommit: '26747d4fbbd51235c612dbd9d8c92ab335aef78e',
      documentationReview: 'researcher-documented',
      reviewedAtUtc: '2026-11-03T14:11:46.614Z',
      reviewNote: 'README/backlog baseline, with Microsoft Learn documentation reviewed by the dedicated researcher in this session on 2026-11-03. This is documentation review only: no live target availability, native adapter, configuration, or continuity is verified.'
    },
    design: {
      runtime: 'Node.js 24 LTS',
      framework: 'Express',
      hosting: 'App Service Linux',
      testTooling: 'Node.js 22.23.4',
      productionRuntimeValidated: false,
      firstNativeTarget: 'App Service: code deployment slots',
      target: { os: null, sku: null, subscription: null, resourceGroup: null, region: null }
    },
    permissions: {
      liveAzureExecutionApproved: false,
      iacGenerationApproved: false,
      scaffoldApproved: false,
      deploymentApproved: false,
      identityRegistrationApproved: false,
      expenditureApproved: false,
      maximumLiveAzureRuns: 0,
      authorizedCloudSpend: 0
    },
    sources: [
      { id: 'app-service-plans', title: 'What are Azure App Service plans?',
        url: 'https://learn.microsoft.com/azure/app-service/overview-hosting-plans',
        baselinePath: 'README.md', verification: 'researcher-documented' },
      { id: 'app-service-slots', title: 'Set up staging environments in Azure App Service',
        url: 'https://learn.microsoft.com/azure/app-service/deploy-staging-slots',
        baselinePath: 'README.md', verification: 'researcher-documented' },
      { id: 'app-service-scaling', title: 'Automatic scaling in Azure App Service',
        url: 'https://learn.microsoft.com/azure/app-service/manage-automatic-scaling',
        baselinePath: 'README.md', verification: 'researcher-documented' },
      { id: 'container-apps-revisions', title: 'Update and deploy changes in Azure Container Apps',
        url: 'https://learn.microsoft.com/azure/container-apps/revisions',
        baselinePath: 'README.md', verification: 'researcher-documented' },
      { id: 'aks-reliability', title: 'Deployment and cluster reliability best practices for AKS',
        url: 'https://learn.microsoft.com/azure/aks/best-practices-app-cluster-reliability',
        baselinePath: 'README.md', verification: 'researcher-documented' },
      { id: 'aks-routing', title: 'AKS application routing and Gateway API migration',
        url: 'https://learn.microsoft.com/azure/aks/app-routing',
        baselinePath: '.docs\\wiki\\backlog.md', verification: 'researcher-documented' },
      { id: 'functions-slots', title: 'Azure Functions deployment slots',
        url: 'https://learn.microsoft.com/azure/azure-functions/functions-deployment-slots',
        baselinePath: 'README.md', verification: 'researcher-documented' },
      { id: 'functions-flex', title: 'Site update strategies in Flex Consumption',
        url: 'https://learn.microsoft.com/azure/azure-functions/flex-consumption-site-updates',
        baselinePath: 'README.md', verification: 'researcher-documented' }
    ],
    rows: [
      row({
        id: 'app-service-first-code-slots', title: 'First planned native target: App Service code slots',
        host: 'app-service', format: 'code', os: 'unapproved', mechanism: 'deployment-slots',
        status: 'planned', documentedSupport: 'documented-supported', firstPlannedNativeTarget: true,
        reason: 'Design/local implementation only. The native OS, SKU, subscription, resource group, and region are unapproved. The App Service Linux control-API design does not select the native test configuration.',
        sourceIds: ['app-service-slots', 'app-service-plans'],
        constraints: [sharedCompute, strictWarmup, slotLifecycle, automaticScaling]
      }),
      row({
        id: 'app-service-windows-code-swap', title: 'App Service Windows code: prepared slot swap',
        host: 'app-service', format: 'code', os: 'windows', mechanism: 'controlled-slot-swap',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Documented mechanism on supporting plans only; no concrete plan, adapter, or Windows configuration is approved or qualified.',
        sourceIds: ['app-service-slots', 'app-service-plans'],
        constraints: [sharedCompute, strictWarmup, slotLifecycle]
      }),
      row({
        id: 'app-service-linux-code-swap', title: 'App Service Linux code: controlled slot swap',
        host: 'app-service', format: 'code', os: 'linux', mechanism: 'controlled-slot-swap',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Documented controlled deployment/swap alternative, not native auto-swap. This row does not approve Linux as the first native target OS.',
        sourceIds: ['app-service-slots', 'app-service-plans'],
        constraints: [sharedCompute, strictWarmup, noAutoSwap, slotLifecycle]
      }),
      row({
        id: 'app-service-linux-auto-swap', title: 'App Service Linux code: native auto-swap',
        host: 'app-service', format: 'code', os: 'linux', mechanism: 'native-auto-swap',
        status: 'unsupported', documentedSupport: 'unsupported', adapter: 'not-applicable',
        reason: 'Native auto-swap is unsupported for Linux web apps; a controlled alternative requires separate qualification.',
        sourceIds: ['app-service-slots'], constraints: [noAutoSwap]
      }),
      row({
        id: 'app-service-container-controlled-swap', title: 'App Service containers: controlled slot swap',
        host: 'app-service', format: 'container', mechanism: 'controlled-slot-swap',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Documented controlled container-slot deployment/swap on a supporting plan. Immutable image pull and initialization require warm-up; native auto-swap remains unsupported. No container target is approved or qualified.',
        sourceIds: ['app-service-slots', 'app-service-plans'],
        constraints: [sharedCompute, strictWarmup, noAutoSwap, slotLifecycle]
      }),
      row({
        id: 'app-service-container-auto-swap', title: 'App Service containers: native auto-swap',
        host: 'app-service', format: 'container', mechanism: 'native-auto-swap',
        status: 'unsupported', documentedSupport: 'unsupported', adapter: 'not-applicable',
        reason: 'Web App for Containers does not support native auto-swap. Do not infer this from code-slot behavior.',
        sourceIds: ['app-service-slots'], constraints: [noAutoSwap]
      }),
      row({
        id: 'app-service-slot-automatic-scaling', title: 'App Service HTTP automatic scaling with slot traffic',
        host: 'app-service', format: 'code-or-container', mechanism: 'http-automatic-scaling-with-slot-traffic',
        status: 'unsupported', documentedSupport: 'unsupported', adapter: 'not-applicable',
        reason: 'HTTP automatic scaling does not support deployment-slot traffic. A traffic split does not add compute and is not rule-based autoscale.',
        sourceIds: ['app-service-scaling', 'app-service-plans'],
        constraints: [automaticScaling, sharedCompute]
      }),
      row({
        id: 'app-service-separate-plans', title: 'App Service: externally routed separate-plan blue-green',
        host: 'app-service', format: 'code-or-container', mechanism: 'external-routing',
        status: 'planned', documentedSupport: 'unknown',
        reason: 'Source scenario S124 proposes separate plans for capacity/lifecycle isolation. External routing and each plan still need approval and target-specific proof; this is not a native slot operation.',
        sourceIds: ['app-service-plans', 'app-service-slots'], constraints: [sharedCompute, slotLifecycle]
      }),
      row({
        id: 'container-apps-single-revision', title: 'Container Apps: single-revision replacement',
        host: 'container-apps', format: 'container', mechanism: 'single-revision',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Documented readiness-gated revision replacement, not a slot swap. No ACA adapter, environment, or capacity configuration is qualified.',
        sourceIds: ['container-apps-revisions'], constraints: [revisionNotSlot]
      }),
      row({
        id: 'container-apps-multiple-revisions', title: 'Container Apps: multiple-revision traffic control',
        host: 'container-apps', format: 'container', mechanism: 'multiple-revisions',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Documented weighted revision routing and controlled retirement. Validate state, rollback compatibility, preview access, and actual user migration independently.',
        sourceIds: ['container-apps-revisions'], constraints: [revisionNotSlot]
      }),
      row({
        id: 'aks-rolling-deployment', title: 'AKS: rolling Deployment',
        host: 'aks', format: 'container', mechanism: 'rolling-deployment',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Documented rollout building blocks, not a continuity guarantee. The cluster, capacity, probes, gateway, and fault envelope remain unselected/unqualified.',
        sourceIds: ['aks-reliability'], constraints: [aksReadiness, pdbScope]
      }),
      row({
        id: 'aks-weighted-routing', title: 'AKS: weighted blue-green/canary routing',
        host: 'aks', format: 'container', mechanism: 'weighted-routing',
        status: 'unknown', documentedSupport: 'unknown',
        reason: 'A capable ingress/gateway/service mesh must be selected and qualified. Deployment objects alone do not provide weighted routing; availability of a concrete routing controller is unknown.',
        sourceIds: ['aks-reliability', 'aks-routing'], constraints: [gatewayScope, pdbScope, aksReadiness,
          fact('gateway-migration-review',
            'The documentation review notes the legacy NGINX application-routing add-on retirement/migration guidance. Select a current supported Gateway API or equivalent implementation explicitly; no routing controller is approved or assumed available here.',
            ['aks-routing'])]
      }),
      row({
        id: 'functions-supporting-plan-slots', title: 'Functions: supporting-plan deployment slots',
        host: 'functions', format: 'function-code', mechanism: 'deployment-slots',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Plan-dependent documentation only. No Functions plan or slot configuration is selected; execution recovery must be proved, not inferred from web-app swaps.',
        sourceIds: ['functions-slots'], constraints: [functionSlots]
      }),
      row({
        id: 'functions-flex-slots', title: 'Functions Flex Consumption: deployment slots',
        host: 'functions', format: 'function-code', mechanism: 'flex-deployment-slots',
        status: 'unsupported', documentedSupport: 'unsupported', adapter: 'not-applicable',
        reason: 'Flex Consumption does not use deployment slots; consider only an available separately qualified update mechanism.',
        sourceIds: ['functions-slots', 'functions-flex'], constraints: [flexLimits]
      }),
      row({
        id: 'functions-flex-site-update', title: 'Functions Flex: rolling site update availability',
        host: 'functions', format: 'function-code', mechanism: 'flex-rolling-site-update',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'Current documentation describes Recreate and RollingUpdate. Availability on a concrete target, capacity, grace limits, and native continuity remain unqualified. Unknown authoritative completion cannot be certified away.',
        sourceIds: ['functions-flex'], constraints: [flexLimits]
      }),
      row({
        id: 'functions-on-container-apps', title: 'Functions on Container Apps: revision transition',
        host: 'functions', format: 'container', mechanism: 'multiple-revisions',
        status: 'documented-supported', documentedSupport: 'documented-supported',
        reason: 'This hosting combination uses Container Apps revisions rather than Functions deployment slots. No hosting or execution-continuity qualification exists here.',
        sourceIds: ['functions-slots', 'container-apps-revisions'], constraints: [revisionNotSlot, functionSlots]
      }),
      row({
        id: 'spring-boot-host-required', title: 'Spring Boot: runtime, not a routing platform',
        host: 'unselected', format: 'code-or-container', runtime: 'java-spring-boot', mechanism: 'host-required',
        status: 'unknown', documentedSupport: 'unknown',
        reason: 'Select a Java-compatible App Service, Container Apps, or AKS host first. Spring Boot itself supplies neither slots nor weighted routing; packaging, Java runtime, and native target availability remain unapproved.',
        sourceIds: ['app-service-slots', 'container-apps-revisions', 'aks-reliability'],
        constraints: [fact('spring-boot-runtime-scope',
          'README platform qualifications and backlog P007 require JVM/bean warm-up, meaningful readiness, graceful servlet/reactive shutdown, and session compatibility on the selected host.',
          ['app-service-slots', 'container-apps-revisions', 'aks-reliability'])]
      })
    ]
  };
  return freeze(matrix);
}));
