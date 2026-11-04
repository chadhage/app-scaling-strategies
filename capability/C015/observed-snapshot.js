(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C015ObservedSnapshot', { value: factory() });
}(globalThis, function () {
  'use strict';
  // Recorded observations from the named raw capture, not a schema or prediction.
  const envelope = {
    action: 'local.probe', budget: { cloudSpend: 0 }, capacity: { units: 1 },
    durationSeconds: 30, load: { concurrentUsers: 2, requestsPerSecond: 10 },
    schemaVersion: 1, scope: { liveAzureRuns: 0, mode: 'local-implementation-only' },
  };
  const limits = {
    budget: { cloudSpend: { max: 0, min: 0 } },
    capacity: { units: { max: 4, min: 1 } }, durationSeconds: { max: 300, min: 1 },
    kind: 'local-comparison-only',
    label: 'C002 synthetic fixture: not Azure authorization or universal defaults',
    load: { concurrentUsers: { max: 20, min: 1 }, requestsPerSecond: { max: 100, min: 1 } },
  };
  const snapshot = {
    source: 'captured-actual-filesystem-fresh-process',
    evidenceFile: 'fixture-16798133-da6d-434c-a75a-a535cf58c949.raw.json',
    capturedAtUtc: '2026-11-04T05:10:32.575Z',
    runs: [
      {
        runId: 'synthetic-run-001', writerPids: [64608, 46012, 54980], readerPid: 49116,
        result: {
          schemaVersion: 1, mode: 'actual-local-filesystem', restored: true,
          namespace: 'synthetic-restart-v1', pid: 49116,
          state: {
            cardId: 'C015', dataKind: 'closed-synthetic-fixture', envelope, epoch: 3, limits,
            record: { acknowledgedUnits: 3, completedStep: 'finish', pendingStep: 'none', status: 'completed' },
            runId: 'synthetic-run-001', schemaVersion: 1,
          },
          acknowledgment: {
            epoch: 3, kind: 'local-file-write-receipt', published: true, regularFileFlushed: true,
            runId: 'synthetic-run-001', schemaVersion: 1,
            stateSha256: '66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135',
          },
          stateSha256: '66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135',
          history: [
            { epoch: 1, stateSha256: 'bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57' },
            { epoch: 2, stateSha256: '789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b' },
            { epoch: 3, stateSha256: '66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135' },
          ],
          source: 'read-and-verified-immutable-files', writesPerformed: 0,
          directoryDurability: 'not-guaranteed', powerLossGuarantee: false,
        },
      },
      {
        runId: 'synthetic-run-002', writerPids: [67132, 53604], readerPid: 46188,
        result: {
          schemaVersion: 1, mode: 'actual-local-filesystem', restored: true,
          namespace: 'synthetic-restart-v1', pid: 46188,
          state: {
            cardId: 'C015', dataKind: 'closed-synthetic-fixture', envelope, epoch: 2, limits,
            record: { acknowledgedUnits: 2, completedStep: 'advance', pendingStep: 'finish', status: 'running' },
            runId: 'synthetic-run-002', schemaVersion: 1,
          },
          acknowledgment: {
            epoch: 2, kind: 'local-file-write-receipt', published: true, regularFileFlushed: true,
            runId: 'synthetic-run-002', schemaVersion: 1,
            stateSha256: 'e4eaf2b69c1debe1fc70077ca718fca38c179dd86c044fce52fe9f28677bd7c5',
          },
          stateSha256: 'e4eaf2b69c1debe1fc70077ca718fca38c179dd86c044fce52fe9f28677bd7c5',
          history: [
            { epoch: 1, stateSha256: '76e4c0ec75225e33704c6228be4d24f76a5fc3bbb4d0cb8bc7551943d8952330' },
            { epoch: 2, stateSha256: 'e4eaf2b69c1debe1fc70077ca718fca38c179dd86c044fce52fe9f28677bd7c5' },
          ],
          source: 'read-and-verified-immutable-files', writesPerformed: 0,
          directoryDurability: 'not-guaranteed', powerLossGuarantee: false,
        },
      },
    ],
  };
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  return freeze(snapshot);
}));
