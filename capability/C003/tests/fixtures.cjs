'use strict';

function validMatrix() {
  return {
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
      documentationReview: 'baseline-only',
      reviewedAtUtc: null,
      reviewNote: 'Baseline documentation; no concrete native target is approved or qualified.'
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
    sources: [{
      id: 'app-service-slots',
      title: 'App Service staging environments',
      url: 'https://learn.microsoft.com/azure/app-service/deploy-staging-slots',
      baselinePath: 'README.md',
      verification: 'baseline-only'
    }],
    rows: [{
      id: 'app-service-first-code-slots',
      title: 'First planned native target: App Service code slots',
      host: 'app-service',
      format: 'code',
      runtime: 'unselected',
      os: 'unapproved',
      mechanism: 'deployment-slots',
      status: 'planned',
      documentedSupport: 'documented-supported',
      adapter: 'planned',
      qualified: false,
      nativeEvidence: [],
      firstPlannedNativeTarget: true,
      reason: 'Design only; OS, SKU, subscription, resource group, and region are unapproved.',
      sourceIds: ['app-service-slots'],
      constraints: [{
        id: 'shared-compute',
        text: 'Slots share plan instances; another slot does not add compute capacity.',
        sourceIds: ['app-service-slots']
      }]
    }]
  };
}

module.exports = { validMatrix };
