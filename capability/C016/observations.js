(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C016Observations', { value: factory() });
}(globalThis, function () {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  return freeze({
  "schemaVersion": 1,
  "cardId": "C016",
  "banner": "Training rehearsal - synthetic data - not a live Azure result",
  "kind": "actual-fresh-node-local-command-observations",
  "capturedAtUtc": "2026-11-04T06:38:02.052Z",
  "nodeVersion": "v22.23.4",
  "originalUnitCredits": 0,
  "cooperativeEnvelope": "C015 single writer marker on a local regular filesystem; no reclamation",
  "cases": [
    {
      "id": "retry",
      "label": "Submit, identical retry, advance and identical retry",
      "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
      "createdNamespacePath": "C:\\Users\\chhage\\repos\\app-scaling-strategies\\capability\\C015\\test-scratch\\test-142cb909-aec8-4472-950a-dc38a862ea0e",
      "processes": [
        {
          "args": [
            "apply",
            "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":61208,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 61208,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "apply",
            "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":67900,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 67900,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "idempotent-confirmed",
            "code": "MATCHING_LOCAL_ACK",
            "publicationPerformed": false,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.restore",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "apply",
            "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "synthetic-run-001",
            "1"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":44512,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":2,\"matchedEpoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 44512,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 2,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 2,
              "matchedEpoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
              "history": [
                {
                  "epoch": 2,
                  "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "apply",
            "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "synthetic-run-001",
            "1"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":1476,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":2,\"matchedEpoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 1476,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "positive",
            "disposition": "idempotent-confirmed",
            "code": "MATCHING_LOCAL_ACK",
            "publicationPerformed": false,
            "acknowledgment": {
              "epoch": 2,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "observation": {
              "source": "C015.restore",
              "observedEpoch": 2,
              "matchedEpoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                },
                {
                  "epoch": 2,
                  "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "read",
            "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "synthetic-run-001"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":3264,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":2,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":2,\"completedStep\":\"advance\",\"pendingStep\":\"finish\",\"status\":\"running\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "mode": "actual-local-filesystem",
            "restored": true,
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 3264,
            "state": {
              "cardId": "C015",
              "dataKind": "closed-synthetic-fixture",
              "envelope": {
                "action": "local.probe",
                "budget": {
                  "cloudSpend": 0
                },
                "capacity": {
                  "units": 1
                },
                "durationSeconds": 30,
                "load": {
                  "concurrentUsers": 2,
                  "requestsPerSecond": 10
                },
                "schemaVersion": 1,
                "scope": {
                  "liveAzureRuns": 0,
                  "mode": "local-implementation-only"
                }
              },
              "epoch": 2,
              "limits": {
                "budget": {
                  "cloudSpend": {
                    "max": 0,
                    "min": 0
                  }
                },
                "capacity": {
                  "units": {
                    "max": 4,
                    "min": 1
                  }
                },
                "durationSeconds": {
                  "max": 300,
                  "min": 1
                },
                "kind": "local-comparison-only",
                "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
                "load": {
                  "concurrentUsers": {
                    "max": 20,
                    "min": 1
                  },
                  "requestsPerSecond": {
                    "max": 100,
                    "min": 1
                  }
                }
              },
              "record": {
                "acknowledgedUnits": 2,
                "completedStep": "advance",
                "pendingStep": "finish",
                "status": "running"
              },
              "runId": "synthetic-run-001",
              "schemaVersion": 1
            },
            "acknowledgment": {
              "epoch": 2,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
            "history": [
              {
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              {
                "epoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              }
            ],
            "source": "read-and-verified-immutable-files",
            "writesPerformed": 0,
            "directoryDurability": "not-guaranteed",
            "powerLossGuarantee": false
          }
        }
      ],
      "entries": [
        {
          "schemaVersion": 1,
          "attempt": 1,
          "process": {
            "pid": 61208,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":61208,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 61208,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 2,
          "process": {
            "pid": 67900,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":67900,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 67900,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "idempotent-confirmed",
            "code": "MATCHING_LOCAL_ACK",
            "publicationPerformed": false,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.restore",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 3,
          "process": {
            "pid": 44512,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":44512,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":2,\"matchedEpoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 44512,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 2,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 2,
              "matchedEpoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
              "history": [
                {
                  "epoch": 2,
                  "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 4,
          "process": {
            "pid": 1476,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":1476,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":2,\"matchedEpoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
            "pid": 1476,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "positive",
            "disposition": "idempotent-confirmed",
            "code": "MATCHING_LOCAL_ACK",
            "publicationPerformed": false,
            "acknowledgment": {
              "epoch": 2,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "observation": {
              "source": "C015.restore",
              "observedEpoch": 2,
              "matchedEpoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                },
                {
                  "epoch": 2,
                  "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        }
      ],
      "journal": {
        "schemaVersion": 1,
        "entries": [
          {
            "schemaVersion": 1,
            "attempt": 1,
            "process": {
              "pid": 61208,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":61208,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
              "pid": 61208,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "positive",
              "disposition": "published",
              "code": "LOCAL_PUBLISHED",
              "publicationPerformed": true,
              "acknowledgment": {
                "epoch": 1,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "observation": {
                "source": "C015.persist",
                "observedEpoch": 1,
                "matchedEpoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 2,
            "process": {
              "pid": 67900,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":67900,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
              "pid": 67900,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "positive",
              "disposition": "idempotent-confirmed",
              "code": "MATCHING_LOCAL_ACK",
              "publicationPerformed": false,
              "acknowledgment": {
                "epoch": 1,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "observation": {
                "source": "C015.restore",
                "observedEpoch": 1,
                "matchedEpoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 3,
            "process": {
              "pid": 44512,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":44512,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":2,\"matchedEpoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
              "pid": 44512,
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "command": {
                "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
                "kind": "advance",
                "runId": "synthetic-run-001",
                "expectedEpoch": 1,
                "epoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              },
              "outcome": "positive",
              "disposition": "published",
              "code": "LOCAL_PUBLISHED",
              "publicationPerformed": true,
              "acknowledgment": {
                "epoch": 2,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              },
              "observation": {
                "source": "C015.persist",
                "observedEpoch": 2,
                "matchedEpoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
                "history": [
                  {
                    "epoch": 2,
                    "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 4,
            "process": {
              "pid": 1476,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":1476,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":2,\"matchedEpoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
              "pid": 1476,
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "command": {
                "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
                "kind": "advance",
                "runId": "synthetic-run-001",
                "expectedEpoch": 1,
                "epoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              },
              "outcome": "positive",
              "disposition": "idempotent-confirmed",
              "code": "MATCHING_LOCAL_ACK",
              "publicationPerformed": false,
              "acknowledgment": {
                "epoch": 2,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              },
              "observation": {
                "source": "C015.restore",
                "observedEpoch": 2,
                "matchedEpoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  },
                  {
                    "epoch": 2,
                    "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          }
        ],
        "observedEpoch": 2,
        "originalUserImpact": "positive",
        "latestOutcome": "positive",
        "unknownAttempts": [],
        "filesystemOperationNow": false
      },
      "retainedFileSha256": {
        "001": "4eab339b78e171f08a09740f8b04766401cf9abc12fc87913b6d87627455841c",
        "002": "ce06d045ebe1099ef6c1bd0e33a84826b1b3dc1d4e13c20664bb95f4858ace51"
      },
      "actualEpochFiles": 2,
      "finalInspection": {
        "args": [
          "read",
          "test-142cb909-aec8-4472-950a-dc38a862ea0e",
          "synthetic-run-001"
        ],
        "exitCode": 0,
        "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-142cb909-aec8-4472-950a-dc38a862ea0e\",\"pid\":3264,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":2,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":2,\"completedStep\":\"advance\",\"pendingStep\":\"finish\",\"status\":\"running\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":2,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},{\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
        "stderr": "",
        "value": {
          "schemaVersion": 1,
          "mode": "actual-local-filesystem",
          "restored": true,
          "namespace": "test-142cb909-aec8-4472-950a-dc38a862ea0e",
          "pid": 3264,
          "state": {
            "cardId": "C015",
            "dataKind": "closed-synthetic-fixture",
            "envelope": {
              "action": "local.probe",
              "budget": {
                "cloudSpend": 0
              },
              "capacity": {
                "units": 1
              },
              "durationSeconds": 30,
              "load": {
                "concurrentUsers": 2,
                "requestsPerSecond": 10
              },
              "schemaVersion": 1,
              "scope": {
                "liveAzureRuns": 0,
                "mode": "local-implementation-only"
              }
            },
            "epoch": 2,
            "limits": {
              "budget": {
                "cloudSpend": {
                  "max": 0,
                  "min": 0
                }
              },
              "capacity": {
                "units": {
                  "max": 4,
                  "min": 1
                }
              },
              "durationSeconds": {
                "max": 300,
                "min": 1
              },
              "kind": "local-comparison-only",
              "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
              "load": {
                "concurrentUsers": {
                  "max": 20,
                  "min": 1
                },
                "requestsPerSecond": {
                  "max": 100,
                  "min": 1
                }
              }
            },
            "record": {
              "acknowledgedUnits": 2,
              "completedStep": "advance",
              "pendingStep": "finish",
              "status": "running"
            },
            "runId": "synthetic-run-001",
            "schemaVersion": 1
          },
          "acknowledgment": {
            "epoch": 2,
            "kind": "local-file-write-receipt",
            "published": true,
            "regularFileFlushed": true,
            "runId": "synthetic-run-001",
            "schemaVersion": 1,
            "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
          },
          "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b",
          "history": [
            {
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            {
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            }
          ],
          "source": "read-and-verified-immutable-files",
          "writesPerformed": 0,
          "directoryDurability": "not-guaranteed",
          "powerLossGuarantee": false
        }
      },
      "exactOwnedScratchCleaned": true,
      "externalBusinessExactlyOnce": false,
      "cloudTransaction": false
    },
    {
      "id": "unknown",
      "label": "Original unobserved stdout remains unknown after a confirmed retry",
      "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
      "createdNamespacePath": "C:\\Users\\chhage\\repos\\app-scaling-strategies\\capability\\C015\\test-scratch\\test-193c4f0b-0803-481e-ab55-e0f969c5533a",
      "processes": [
        {
          "args": [
            "lost-stdout",
            "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 87,
          "stdout": "",
          "stderr": "{\"code\":\"CLIENT_ACK_UNOBSERVED\",\"stage\":\"after-receipt-before-stdout\",\"acknowledged\":false,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"pid\":66196}\n",
          "value": {
            "code": "CLIENT_ACK_UNOBSERVED",
            "stage": "after-receipt-before-stdout",
            "acknowledged": false,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "pid": 66196
          }
        },
        {
          "args": [
            "apply",
            "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-193c4f0b-0803-481e-ab55-e0f969c5533a\",\"pid\":55700,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "pid": 55700,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "idempotent-confirmed",
            "code": "MATCHING_LOCAL_ACK",
            "publicationPerformed": false,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.restore",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "read",
            "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "synthetic-run-001"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-193c4f0b-0803-481e-ab55-e0f969c5533a\",\"pid\":47132,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":1,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":1,\"completedStep\":\"prepare\",\"pendingStep\":\"advance\",\"status\":\"prepared\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "mode": "actual-local-filesystem",
            "restored": true,
            "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "pid": 47132,
            "state": {
              "cardId": "C015",
              "dataKind": "closed-synthetic-fixture",
              "envelope": {
                "action": "local.probe",
                "budget": {
                  "cloudSpend": 0
                },
                "capacity": {
                  "units": 1
                },
                "durationSeconds": 30,
                "load": {
                  "concurrentUsers": 2,
                  "requestsPerSecond": 10
                },
                "schemaVersion": 1,
                "scope": {
                  "liveAzureRuns": 0,
                  "mode": "local-implementation-only"
                }
              },
              "epoch": 1,
              "limits": {
                "budget": {
                  "cloudSpend": {
                    "max": 0,
                    "min": 0
                  }
                },
                "capacity": {
                  "units": {
                    "max": 4,
                    "min": 1
                  }
                },
                "durationSeconds": {
                  "max": 300,
                  "min": 1
                },
                "kind": "local-comparison-only",
                "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
                "load": {
                  "concurrentUsers": {
                    "max": 20,
                    "min": 1
                  },
                  "requestsPerSecond": {
                    "max": 100,
                    "min": 1
                  }
                }
              },
              "record": {
                "acknowledgedUnits": 1,
                "completedStep": "prepare",
                "pendingStep": "advance",
                "status": "prepared"
              },
              "runId": "synthetic-run-001",
              "schemaVersion": 1
            },
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
            "history": [
              {
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              }
            ],
            "source": "read-and-verified-immutable-files",
            "writesPerformed": 0,
            "directoryDurability": "not-guaranteed",
            "powerLossGuarantee": false
          }
        }
      ],
      "entries": [
        {
          "schemaVersion": 1,
          "attempt": 1,
          "process": {
            "pid": 66196,
            "exitCode": 87,
            "stdout": "",
            "stderr": "{\"code\":\"CLIENT_ACK_UNOBSERVED\",\"stage\":\"after-receipt-before-stdout\",\"acknowledged\":false,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"pid\":66196}\n"
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "pid": 66196,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "CLIENT_ACK_UNOBSERVED",
            "publicationPerformed": null,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "CLIENT_ACK_UNOBSERVED",
                "message": "The original process exited without returning a matching command acknowledgment."
              }
            ],
            "allowedRecovery": "inspect-and-retry-identical"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 2,
          "process": {
            "pid": 55700,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-193c4f0b-0803-481e-ab55-e0f969c5533a\",\"pid\":55700,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
            "pid": 55700,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "idempotent-confirmed",
            "code": "MATCHING_LOCAL_ACK",
            "publicationPerformed": false,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.restore",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        }
      ],
      "journal": {
        "schemaVersion": 1,
        "entries": [
          {
            "schemaVersion": 1,
            "attempt": 1,
            "process": {
              "pid": 66196,
              "exitCode": 87,
              "stdout": "",
              "stderr": "{\"code\":\"CLIENT_ACK_UNOBSERVED\",\"stage\":\"after-receipt-before-stdout\",\"acknowledged\":false,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"pid\":66196}\n"
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
              "pid": 66196,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "unknown",
              "disposition": "unconfirmed",
              "code": "CLIENT_ACK_UNOBSERVED",
              "publicationPerformed": null,
              "acknowledgment": null,
              "observation": null,
              "errors": [
                {
                  "code": "CLIENT_ACK_UNOBSERVED",
                  "message": "The original process exited without returning a matching command acknowledgment."
                }
              ],
              "allowedRecovery": "inspect-and-retry-identical"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 2,
            "process": {
              "pid": 55700,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-193c4f0b-0803-481e-ab55-e0f969c5533a\",\"pid\":55700,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"idempotent-confirmed\",\"code\":\"MATCHING_LOCAL_ACK\",\"publicationPerformed\":false,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.restore\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
              "pid": 55700,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "positive",
              "disposition": "idempotent-confirmed",
              "code": "MATCHING_LOCAL_ACK",
              "publicationPerformed": false,
              "acknowledgment": {
                "epoch": 1,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "observation": {
                "source": "C015.restore",
                "observedEpoch": 1,
                "matchedEpoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          }
        ],
        "observedEpoch": 1,
        "originalUserImpact": "unknown",
        "latestOutcome": "positive",
        "unknownAttempts": [
          1
        ],
        "filesystemOperationNow": false
      },
      "retainedFileSha256": {
        "001": "4eab339b78e171f08a09740f8b04766401cf9abc12fc87913b6d87627455841c"
      },
      "actualEpochFiles": 1,
      "finalInspection": {
        "args": [
          "read",
          "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
          "synthetic-run-001"
        ],
        "exitCode": 0,
        "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-193c4f0b-0803-481e-ab55-e0f969c5533a\",\"pid\":47132,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":1,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":1,\"completedStep\":\"prepare\",\"pendingStep\":\"advance\",\"status\":\"prepared\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
        "stderr": "",
        "value": {
          "schemaVersion": 1,
          "mode": "actual-local-filesystem",
          "restored": true,
          "namespace": "test-193c4f0b-0803-481e-ab55-e0f969c5533a",
          "pid": 47132,
          "state": {
            "cardId": "C015",
            "dataKind": "closed-synthetic-fixture",
            "envelope": {
              "action": "local.probe",
              "budget": {
                "cloudSpend": 0
              },
              "capacity": {
                "units": 1
              },
              "durationSeconds": 30,
              "load": {
                "concurrentUsers": 2,
                "requestsPerSecond": 10
              },
              "schemaVersion": 1,
              "scope": {
                "liveAzureRuns": 0,
                "mode": "local-implementation-only"
              }
            },
            "epoch": 1,
            "limits": {
              "budget": {
                "cloudSpend": {
                  "max": 0,
                  "min": 0
                }
              },
              "capacity": {
                "units": {
                  "max": 4,
                  "min": 1
                }
              },
              "durationSeconds": {
                "max": 300,
                "min": 1
              },
              "kind": "local-comparison-only",
              "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
              "load": {
                "concurrentUsers": {
                  "max": 20,
                  "min": 1
                },
                "requestsPerSecond": {
                  "max": 100,
                  "min": 1
                }
              }
            },
            "record": {
              "acknowledgedUnits": 1,
              "completedStep": "prepare",
              "pendingStep": "advance",
              "status": "prepared"
            },
            "runId": "synthetic-run-001",
            "schemaVersion": 1
          },
          "acknowledgment": {
            "epoch": 1,
            "kind": "local-file-write-receipt",
            "published": true,
            "regularFileFlushed": true,
            "runId": "synthetic-run-001",
            "schemaVersion": 1,
            "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
          },
          "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
          "history": [
            {
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            }
          ],
          "source": "read-and-verified-immutable-files",
          "writesPerformed": 0,
          "directoryDurability": "not-guaranteed",
          "powerLossGuarantee": false
        }
      },
      "exactOwnedScratchCleaned": true,
      "externalBusinessExactlyOnce": false,
      "cloudTransaction": false
    },
    {
      "id": "conflict",
      "label": "Future expected epoch is rejected without advancement",
      "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
      "createdNamespacePath": "C:\\Users\\chhage\\repos\\app-scaling-strategies\\capability\\C015\\test-scratch\\test-9b2f0946-9eda-49c4-9313-8756aced6706",
      "processes": [
        {
          "args": [
            "apply",
            "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":39872,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "pid": 39872,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "apply",
            "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "synthetic-run-001",
            "2"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":42416,\"commandId\":\"C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b\",\"command\":{\"commandId\":\"C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b\",\"kind\":\"finish\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":2,\"epoch\":3,\"stateSha256\":\"66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135\"},\"outcome\":\"negative\",\"disposition\":\"rejected\",\"code\":\"EXPECTED_EPOCH_CONFLICT\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"EXPECTED_EPOCH_CONFLICT\",\"message\":\"Expected epoch 2 does not match observed epoch 1; no publication admitted.\"}],\"allowedRecovery\":\"inspect-and-declare-next\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "pid": 42416,
            "commandId": "C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b",
            "command": {
              "commandId": "C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b",
              "kind": "finish",
              "runId": "synthetic-run-001",
              "expectedEpoch": 2,
              "epoch": 3,
              "stateSha256": "66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135"
            },
            "outcome": "negative",
            "disposition": "rejected",
            "code": "EXPECTED_EPOCH_CONFLICT",
            "publicationPerformed": false,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "EXPECTED_EPOCH_CONFLICT",
                "message": "Expected epoch 2 does not match observed epoch 1; no publication admitted."
              }
            ],
            "allowedRecovery": "inspect-and-declare-next"
          }
        },
        {
          "args": [
            "read",
            "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "synthetic-run-001"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":56996,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":1,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":1,\"completedStep\":\"prepare\",\"pendingStep\":\"advance\",\"status\":\"prepared\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "mode": "actual-local-filesystem",
            "restored": true,
            "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "pid": 56996,
            "state": {
              "cardId": "C015",
              "dataKind": "closed-synthetic-fixture",
              "envelope": {
                "action": "local.probe",
                "budget": {
                  "cloudSpend": 0
                },
                "capacity": {
                  "units": 1
                },
                "durationSeconds": 30,
                "load": {
                  "concurrentUsers": 2,
                  "requestsPerSecond": 10
                },
                "schemaVersion": 1,
                "scope": {
                  "liveAzureRuns": 0,
                  "mode": "local-implementation-only"
                }
              },
              "epoch": 1,
              "limits": {
                "budget": {
                  "cloudSpend": {
                    "max": 0,
                    "min": 0
                  }
                },
                "capacity": {
                  "units": {
                    "max": 4,
                    "min": 1
                  }
                },
                "durationSeconds": {
                  "max": 300,
                  "min": 1
                },
                "kind": "local-comparison-only",
                "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
                "load": {
                  "concurrentUsers": {
                    "max": 20,
                    "min": 1
                  },
                  "requestsPerSecond": {
                    "max": 100,
                    "min": 1
                  }
                }
              },
              "record": {
                "acknowledgedUnits": 1,
                "completedStep": "prepare",
                "pendingStep": "advance",
                "status": "prepared"
              },
              "runId": "synthetic-run-001",
              "schemaVersion": 1
            },
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
            "history": [
              {
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              }
            ],
            "source": "read-and-verified-immutable-files",
            "writesPerformed": 0,
            "directoryDurability": "not-guaranteed",
            "powerLossGuarantee": false
          }
        }
      ],
      "entries": [
        {
          "schemaVersion": 1,
          "attempt": 1,
          "process": {
            "pid": 39872,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":39872,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "pid": 39872,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 2,
          "process": {
            "pid": 42416,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":42416,\"commandId\":\"C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b\",\"command\":{\"commandId\":\"C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b\",\"kind\":\"finish\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":2,\"epoch\":3,\"stateSha256\":\"66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135\"},\"outcome\":\"negative\",\"disposition\":\"rejected\",\"code\":\"EXPECTED_EPOCH_CONFLICT\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"EXPECTED_EPOCH_CONFLICT\",\"message\":\"Expected epoch 2 does not match observed epoch 1; no publication admitted.\"}],\"allowedRecovery\":\"inspect-and-declare-next\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
            "pid": 42416,
            "commandId": "C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b",
            "command": {
              "commandId": "C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b",
              "kind": "finish",
              "runId": "synthetic-run-001",
              "expectedEpoch": 2,
              "epoch": 3,
              "stateSha256": "66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135"
            },
            "outcome": "negative",
            "disposition": "rejected",
            "code": "EXPECTED_EPOCH_CONFLICT",
            "publicationPerformed": false,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "EXPECTED_EPOCH_CONFLICT",
                "message": "Expected epoch 2 does not match observed epoch 1; no publication admitted."
              }
            ],
            "allowedRecovery": "inspect-and-declare-next"
          }
        }
      ],
      "journal": {
        "schemaVersion": 1,
        "entries": [
          {
            "schemaVersion": 1,
            "attempt": 1,
            "process": {
              "pid": 39872,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":39872,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
              "pid": 39872,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "positive",
              "disposition": "published",
              "code": "LOCAL_PUBLISHED",
              "publicationPerformed": true,
              "acknowledgment": {
                "epoch": 1,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "observation": {
                "source": "C015.persist",
                "observedEpoch": 1,
                "matchedEpoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 2,
            "process": {
              "pid": 42416,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":42416,\"commandId\":\"C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b\",\"command\":{\"commandId\":\"C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b\",\"kind\":\"finish\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":2,\"epoch\":3,\"stateSha256\":\"66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135\"},\"outcome\":\"negative\",\"disposition\":\"rejected\",\"code\":\"EXPECTED_EPOCH_CONFLICT\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"EXPECTED_EPOCH_CONFLICT\",\"message\":\"Expected epoch 2 does not match observed epoch 1; no publication admitted.\"}],\"allowedRecovery\":\"inspect-and-declare-next\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
              "pid": 42416,
              "commandId": "C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b",
              "command": {
                "commandId": "C016-3a39ca1a91489054dd38231cc34e78734e11ef148111bd9824e31851eda5512b",
                "kind": "finish",
                "runId": "synthetic-run-001",
                "expectedEpoch": 2,
                "epoch": 3,
                "stateSha256": "66f2593752364d65b37d145cf9b784e09dc86867643766bd9f14f8c7d0f1f135"
              },
              "outcome": "negative",
              "disposition": "rejected",
              "code": "EXPECTED_EPOCH_CONFLICT",
              "publicationPerformed": false,
              "acknowledgment": null,
              "observation": null,
              "errors": [
                {
                  "code": "EXPECTED_EPOCH_CONFLICT",
                  "message": "Expected epoch 2 does not match observed epoch 1; no publication admitted."
                }
              ],
              "allowedRecovery": "inspect-and-declare-next"
            }
          }
        ],
        "observedEpoch": 1,
        "originalUserImpact": "positive",
        "latestOutcome": "negative",
        "unknownAttempts": [],
        "filesystemOperationNow": false
      },
      "retainedFileSha256": {
        "001": "4eab339b78e171f08a09740f8b04766401cf9abc12fc87913b6d87627455841c"
      },
      "actualEpochFiles": 1,
      "finalInspection": {
        "args": [
          "read",
          "test-9b2f0946-9eda-49c4-9313-8756aced6706",
          "synthetic-run-001"
        ],
        "exitCode": 0,
        "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-9b2f0946-9eda-49c4-9313-8756aced6706\",\"pid\":56996,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":1,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":1,\"completedStep\":\"prepare\",\"pendingStep\":\"advance\",\"status\":\"prepared\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
        "stderr": "",
        "value": {
          "schemaVersion": 1,
          "mode": "actual-local-filesystem",
          "restored": true,
          "namespace": "test-9b2f0946-9eda-49c4-9313-8756aced6706",
          "pid": 56996,
          "state": {
            "cardId": "C015",
            "dataKind": "closed-synthetic-fixture",
            "envelope": {
              "action": "local.probe",
              "budget": {
                "cloudSpend": 0
              },
              "capacity": {
                "units": 1
              },
              "durationSeconds": 30,
              "load": {
                "concurrentUsers": 2,
                "requestsPerSecond": 10
              },
              "schemaVersion": 1,
              "scope": {
                "liveAzureRuns": 0,
                "mode": "local-implementation-only"
              }
            },
            "epoch": 1,
            "limits": {
              "budget": {
                "cloudSpend": {
                  "max": 0,
                  "min": 0
                }
              },
              "capacity": {
                "units": {
                  "max": 4,
                  "min": 1
                }
              },
              "durationSeconds": {
                "max": 300,
                "min": 1
              },
              "kind": "local-comparison-only",
              "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
              "load": {
                "concurrentUsers": {
                  "max": 20,
                  "min": 1
                },
                "requestsPerSecond": {
                  "max": 100,
                  "min": 1
                }
              }
            },
            "record": {
              "acknowledgedUnits": 1,
              "completedStep": "prepare",
              "pendingStep": "advance",
              "status": "prepared"
            },
            "runId": "synthetic-run-001",
            "schemaVersion": 1
          },
          "acknowledgment": {
            "epoch": 1,
            "kind": "local-file-write-receipt",
            "published": true,
            "regularFileFlushed": true,
            "runId": "synthetic-run-001",
            "schemaVersion": 1,
            "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
          },
          "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
          "history": [
            {
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            }
          ],
          "source": "read-and-verified-immutable-files",
          "writesPerformed": 0,
          "directoryDurability": "not-guaranteed",
          "powerLossGuarantee": false
        }
      },
      "exactOwnedScratchCleaned": true,
      "externalBusinessExactlyOnce": false,
      "cloudTransaction": false
    },
    {
      "id": "hold",
      "label": "Unobserved C015 publication holds, including an older matching retry",
      "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
      "createdNamespacePath": "C:\\Users\\chhage\\repos\\app-scaling-strategies\\capability\\C015\\test-scratch\\test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
      "processes": [
        {
          "args": [
            "apply",
            "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":62548,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 62548,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "c015-fault",
            "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "synthetic-run-001",
            "1",
            "after-publish"
          ],
          "exitCode": 86,
          "stdout": "",
          "stderr": "{\"code\":\"FAIL_BEFORE_ACK\",\"stage\":\"after-publish\",\"acknowledged\":false,\"pid\":48792}\n",
          "value": {
            "code": "FAIL_BEFORE_ACK",
            "stage": "after-publish",
            "acknowledged": false,
            "pid": 48792
          }
        },
        {
          "args": [
            "apply",
            "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":53856,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 53856,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "HOLD_UNOBSERVED",
            "publicationPerformed": false,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "HOLD_UNOBSERVED",
                "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        },
        {
          "args": [
            "apply",
            "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "synthetic-run-001",
            "1"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":20748,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 20748,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "HOLD_UNOBSERVED",
            "publicationPerformed": false,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "HOLD_UNOBSERVED",
                "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        },
        {
          "args": [
            "read",
            "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "synthetic-run-001"
          ],
          "exitCode": 1,
          "stdout": "",
          "stderr": "{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\",\"acknowledged\":false,\"pid\":52132}\n",
          "value": {
            "code": "HOLD_UNOBSERVED",
            "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.",
            "acknowledged": false,
            "pid": 52132
          }
        }
      ],
      "entries": [
        {
          "schemaVersion": 1,
          "attempt": 1,
          "process": {
            "pid": 62548,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":62548,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 62548,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 2,
          "process": {
            "pid": 48792,
            "exitCode": 86,
            "stdout": "",
            "stderr": "{\"code\":\"FAIL_BEFORE_ACK\",\"stage\":\"after-publish\",\"acknowledged\":false,\"pid\":48792}\n"
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 48792,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "FAIL_BEFORE_ACK",
            "publicationPerformed": null,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "FAIL_BEFORE_ACK",
                "message": "The original process exited without returning a matching command acknowledgment."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 3,
          "process": {
            "pid": 53856,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":53856,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 53856,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "HOLD_UNOBSERVED",
            "publicationPerformed": false,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "HOLD_UNOBSERVED",
                "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 4,
          "process": {
            "pid": 20748,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":20748,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
            "pid": 20748,
            "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
            "command": {
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "kind": "advance",
              "runId": "synthetic-run-001",
              "expectedEpoch": 1,
              "epoch": 2,
              "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "HOLD_UNOBSERVED",
            "publicationPerformed": false,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "HOLD_UNOBSERVED",
                "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        }
      ],
      "journal": {
        "schemaVersion": 1,
        "entries": [
          {
            "schemaVersion": 1,
            "attempt": 1,
            "process": {
              "pid": 62548,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":62548,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
              "pid": 62548,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "positive",
              "disposition": "published",
              "code": "LOCAL_PUBLISHED",
              "publicationPerformed": true,
              "acknowledgment": {
                "epoch": 1,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "observation": {
                "source": "C015.persist",
                "observedEpoch": 1,
                "matchedEpoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 2,
            "process": {
              "pid": 48792,
              "exitCode": 86,
              "stdout": "",
              "stderr": "{\"code\":\"FAIL_BEFORE_ACK\",\"stage\":\"after-publish\",\"acknowledged\":false,\"pid\":48792}\n"
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
              "pid": 48792,
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "command": {
                "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
                "kind": "advance",
                "runId": "synthetic-run-001",
                "expectedEpoch": 1,
                "epoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              },
              "outcome": "unknown",
              "disposition": "unconfirmed",
              "code": "FAIL_BEFORE_ACK",
              "publicationPerformed": null,
              "acknowledgment": null,
              "observation": null,
              "errors": [
                {
                  "code": "FAIL_BEFORE_ACK",
                  "message": "The original process exited without returning a matching command acknowledgment."
                }
              ],
              "allowedRecovery": "operator-review-no-marker-reclamation"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 3,
            "process": {
              "pid": 53856,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":53856,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
              "pid": 53856,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "unknown",
              "disposition": "unconfirmed",
              "code": "HOLD_UNOBSERVED",
              "publicationPerformed": false,
              "acknowledgment": null,
              "observation": null,
              "errors": [
                {
                  "code": "HOLD_UNOBSERVED",
                  "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
                }
              ],
              "allowedRecovery": "operator-review-no-marker-reclamation"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 4,
            "process": {
              "pid": 20748,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-b2d29a7e-f80e-4344-bd47-be1ddb517be0\",\"pid\":20748,\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"command\":{\"commandId\":\"C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6\",\"kind\":\"advance\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":1,\"epoch\":2,\"stateSha256\":\"789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":false,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
              "pid": 20748,
              "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
              "command": {
                "commandId": "C016-4e96311ec692238aa1e7d2d4219c3af73a8c30dc6389e813f5a18c6a8fd483d6",
                "kind": "advance",
                "runId": "synthetic-run-001",
                "expectedEpoch": 1,
                "epoch": 2,
                "stateSha256": "789afc63196ba012724221c60914d3065f7c93056e48892e2ceb5f22031ea95b"
              },
              "outcome": "unknown",
              "disposition": "unconfirmed",
              "code": "HOLD_UNOBSERVED",
              "publicationPerformed": false,
              "acknowledgment": null,
              "observation": null,
              "errors": [
                {
                  "code": "HOLD_UNOBSERVED",
                  "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
                }
              ],
              "allowedRecovery": "operator-review-no-marker-reclamation"
            }
          }
        ],
        "observedEpoch": 1,
        "originalUserImpact": "positive",
        "latestOutcome": "unknown",
        "unknownAttempts": [
          2,
          3,
          4
        ],
        "filesystemOperationNow": false
      },
      "retainedFileSha256": {
        "001": "4eab339b78e171f08a09740f8b04766401cf9abc12fc87913b6d87627455841c",
        "002": "ce06d045ebe1099ef6c1bd0e33a84826b1b3dc1d4e13c20664bb95f4858ace51"
      },
      "actualEpochFiles": 2,
      "finalInspection": {
        "args": [
          "read",
          "test-b2d29a7e-f80e-4344-bd47-be1ddb517be0",
          "synthetic-run-001"
        ],
        "exitCode": 1,
        "stdout": "",
        "stderr": "{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\",\"acknowledged\":false,\"pid\":52132}\n",
        "value": {
          "code": "HOLD_UNOBSERVED",
          "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.",
          "acknowledged": false,
          "pid": 52132
        }
      },
      "exactOwnedScratchCleaned": true,
      "externalBusinessExactlyOnce": false,
      "cloudTransaction": false
    },
    {
      "id": "duplicates",
      "label": "Two concurrent duplicate processes; one intended publication",
      "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
      "createdNamespacePath": "C:\\Users\\chhage\\repos\\app-scaling-strategies\\capability\\C015\\test-scratch\\test-74c99e94-7bc2-43bc-be7d-155da71236be",
      "processes": [
        {
          "args": [
            "apply",
            "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":64668,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "pid": 64668,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "args": [
            "apply",
            "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "synthetic-run-001",
            "0"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":9096,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":null,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"STORAGE_ERROR\",\"message\":\"Local filesystem operation failed (EEXIST); no acknowledgment or reset.\"},{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "pid": 9096,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "HOLD_UNOBSERVED",
            "publicationPerformed": null,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "STORAGE_ERROR",
                "message": "Local filesystem operation failed (EEXIST); no acknowledgment or reset."
              },
              {
                "code": "HOLD_UNOBSERVED",
                "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        },
        {
          "args": [
            "read",
            "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "synthetic-run-001"
          ],
          "exitCode": 0,
          "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":66456,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":1,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":1,\"completedStep\":\"prepare\",\"pendingStep\":\"advance\",\"status\":\"prepared\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
          "stderr": "",
          "value": {
            "schemaVersion": 1,
            "mode": "actual-local-filesystem",
            "restored": true,
            "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "pid": 66456,
            "state": {
              "cardId": "C015",
              "dataKind": "closed-synthetic-fixture",
              "envelope": {
                "action": "local.probe",
                "budget": {
                  "cloudSpend": 0
                },
                "capacity": {
                  "units": 1
                },
                "durationSeconds": 30,
                "load": {
                  "concurrentUsers": 2,
                  "requestsPerSecond": 10
                },
                "schemaVersion": 1,
                "scope": {
                  "liveAzureRuns": 0,
                  "mode": "local-implementation-only"
                }
              },
              "epoch": 1,
              "limits": {
                "budget": {
                  "cloudSpend": {
                    "max": 0,
                    "min": 0
                  }
                },
                "capacity": {
                  "units": {
                    "max": 4,
                    "min": 1
                  }
                },
                "durationSeconds": {
                  "max": 300,
                  "min": 1
                },
                "kind": "local-comparison-only",
                "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
                "load": {
                  "concurrentUsers": {
                    "max": 20,
                    "min": 1
                  },
                  "requestsPerSecond": {
                    "max": 100,
                    "min": 1
                  }
                }
              },
              "record": {
                "acknowledgedUnits": 1,
                "completedStep": "prepare",
                "pendingStep": "advance",
                "status": "prepared"
              },
              "runId": "synthetic-run-001",
              "schemaVersion": 1
            },
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
            "history": [
              {
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              }
            ],
            "source": "read-and-verified-immutable-files",
            "writesPerformed": 0,
            "directoryDurability": "not-guaranteed",
            "powerLossGuarantee": false
          }
        }
      ],
      "entries": [
        {
          "schemaVersion": 1,
          "attempt": 1,
          "process": {
            "pid": 64668,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":64668,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "pid": 64668,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "positive",
            "disposition": "published",
            "code": "LOCAL_PUBLISHED",
            "publicationPerformed": true,
            "acknowledgment": {
              "epoch": 1,
              "kind": "local-file-write-receipt",
              "published": true,
              "regularFileFlushed": true,
              "runId": "synthetic-run-001",
              "schemaVersion": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "observation": {
              "source": "C015.persist",
              "observedEpoch": 1,
              "matchedEpoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
              "history": [
                {
                  "epoch": 1,
                  "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                }
              ]
            },
            "errors": [],
            "allowedRecovery": "none"
          }
        },
        {
          "schemaVersion": 1,
          "attempt": 2,
          "process": {
            "pid": 9096,
            "exitCode": 0,
            "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":9096,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":null,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"STORAGE_ERROR\",\"message\":\"Local filesystem operation failed (EEXIST); no acknowledgment or reset.\"},{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
            "stderr": ""
          },
          "result": {
            "schemaVersion": 1,
            "cardId": "C016",
            "mode": "actual-local-filesystem-command",
            "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
            "pid": 9096,
            "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
            "command": {
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "kind": "submit",
              "runId": "synthetic-run-001",
              "expectedEpoch": 0,
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            },
            "outcome": "unknown",
            "disposition": "unconfirmed",
            "code": "HOLD_UNOBSERVED",
            "publicationPerformed": null,
            "acknowledgment": null,
            "observation": null,
            "errors": [
              {
                "code": "STORAGE_ERROR",
                "message": "Local filesystem operation failed (EEXIST); no acknowledgment or reset."
              },
              {
                "code": "HOLD_UNOBSERVED",
                "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
              }
            ],
            "allowedRecovery": "operator-review-no-marker-reclamation"
          }
        }
      ],
      "journal": {
        "schemaVersion": 1,
        "entries": [
          {
            "schemaVersion": 1,
            "attempt": 1,
            "process": {
              "pid": 64668,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":64668,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"positive\",\"disposition\":\"published\",\"code\":\"LOCAL_PUBLISHED\",\"publicationPerformed\":true,\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"observation\":{\"source\":\"C015.persist\",\"observedEpoch\":1,\"matchedEpoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}]},\"errors\":[],\"allowedRecovery\":\"none\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
              "pid": 64668,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "positive",
              "disposition": "published",
              "code": "LOCAL_PUBLISHED",
              "publicationPerformed": true,
              "acknowledgment": {
                "epoch": 1,
                "kind": "local-file-write-receipt",
                "published": true,
                "regularFileFlushed": true,
                "runId": "synthetic-run-001",
                "schemaVersion": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "observation": {
                "source": "C015.persist",
                "observedEpoch": 1,
                "matchedEpoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
                "history": [
                  {
                    "epoch": 1,
                    "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
                  }
                ]
              },
              "errors": [],
              "allowedRecovery": "none"
            }
          },
          {
            "schemaVersion": 1,
            "attempt": 2,
            "process": {
              "pid": 9096,
              "exitCode": 0,
              "stdout": "{\"schemaVersion\":1,\"cardId\":\"C016\",\"mode\":\"actual-local-filesystem-command\",\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":9096,\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"command\":{\"commandId\":\"C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca\",\"kind\":\"submit\",\"runId\":\"synthetic-run-001\",\"expectedEpoch\":0,\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"outcome\":\"unknown\",\"disposition\":\"unconfirmed\",\"code\":\"HOLD_UNOBSERVED\",\"publicationPerformed\":null,\"acknowledgment\":null,\"observation\":null,\"errors\":[{\"code\":\"STORAGE_ERROR\",\"message\":\"Local filesystem operation failed (EEXIST); no acknowledgment or reset.\"},{\"code\":\"HOLD_UNOBSERVED\",\"message\":\"A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically.\"}],\"allowedRecovery\":\"operator-review-no-marker-reclamation\"}\n",
              "stderr": ""
            },
            "result": {
              "schemaVersion": 1,
              "cardId": "C016",
              "mode": "actual-local-filesystem-command",
              "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
              "pid": 9096,
              "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
              "command": {
                "commandId": "C016-5a69fcb8c351bf5ca91056d987f56044d6c8fc543f92a7be7012287d699a70ca",
                "kind": "submit",
                "runId": "synthetic-run-001",
                "expectedEpoch": 0,
                "epoch": 1,
                "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
              },
              "outcome": "unknown",
              "disposition": "unconfirmed",
              "code": "HOLD_UNOBSERVED",
              "publicationPerformed": null,
              "acknowledgment": null,
              "observation": null,
              "errors": [
                {
                  "code": "STORAGE_ERROR",
                  "message": "Local filesystem operation failed (EEXIST); no acknowledgment or reset."
                },
                {
                  "code": "HOLD_UNOBSERVED",
                  "message": "A writer marker remains. An incomplete or unobserved publication needs explicit operator review; never reclaim it automatically."
                }
              ],
              "allowedRecovery": "operator-review-no-marker-reclamation"
            }
          }
        ],
        "observedEpoch": 1,
        "originalUserImpact": "positive",
        "latestOutcome": "unknown",
        "unknownAttempts": [
          2
        ],
        "filesystemOperationNow": false
      },
      "retainedFileSha256": {
        "001": "4eab339b78e171f08a09740f8b04766401cf9abc12fc87913b6d87627455841c"
      },
      "actualEpochFiles": 1,
      "finalInspection": {
        "args": [
          "read",
          "test-74c99e94-7bc2-43bc-be7d-155da71236be",
          "synthetic-run-001"
        ],
        "exitCode": 0,
        "stdout": "{\"schemaVersion\":1,\"mode\":\"actual-local-filesystem\",\"restored\":true,\"namespace\":\"test-74c99e94-7bc2-43bc-be7d-155da71236be\",\"pid\":66456,\"state\":{\"cardId\":\"C015\",\"dataKind\":\"closed-synthetic-fixture\",\"envelope\":{\"action\":\"local.probe\",\"budget\":{\"cloudSpend\":0},\"capacity\":{\"units\":1},\"durationSeconds\":30,\"load\":{\"concurrentUsers\":2,\"requestsPerSecond\":10},\"schemaVersion\":1,\"scope\":{\"liveAzureRuns\":0,\"mode\":\"local-implementation-only\"}},\"epoch\":1,\"limits\":{\"budget\":{\"cloudSpend\":{\"max\":0,\"min\":0}},\"capacity\":{\"units\":{\"max\":4,\"min\":1}},\"durationSeconds\":{\"max\":300,\"min\":1},\"kind\":\"local-comparison-only\",\"label\":\"C002 synthetic fixture: not Azure authorization or universal defaults\",\"load\":{\"concurrentUsers\":{\"max\":20,\"min\":1},\"requestsPerSecond\":{\"max\":100,\"min\":1}}},\"record\":{\"acknowledgedUnits\":1,\"completedStep\":\"prepare\",\"pendingStep\":\"advance\",\"status\":\"prepared\"},\"runId\":\"synthetic-run-001\",\"schemaVersion\":1},\"acknowledgment\":{\"epoch\":1,\"kind\":\"local-file-write-receipt\",\"published\":true,\"regularFileFlushed\":true,\"runId\":\"synthetic-run-001\",\"schemaVersion\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"},\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\",\"history\":[{\"epoch\":1,\"stateSha256\":\"bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57\"}],\"source\":\"read-and-verified-immutable-files\",\"writesPerformed\":0,\"directoryDurability\":\"not-guaranteed\",\"powerLossGuarantee\":false}\n",
        "stderr": "",
        "value": {
          "schemaVersion": 1,
          "mode": "actual-local-filesystem",
          "restored": true,
          "namespace": "test-74c99e94-7bc2-43bc-be7d-155da71236be",
          "pid": 66456,
          "state": {
            "cardId": "C015",
            "dataKind": "closed-synthetic-fixture",
            "envelope": {
              "action": "local.probe",
              "budget": {
                "cloudSpend": 0
              },
              "capacity": {
                "units": 1
              },
              "durationSeconds": 30,
              "load": {
                "concurrentUsers": 2,
                "requestsPerSecond": 10
              },
              "schemaVersion": 1,
              "scope": {
                "liveAzureRuns": 0,
                "mode": "local-implementation-only"
              }
            },
            "epoch": 1,
            "limits": {
              "budget": {
                "cloudSpend": {
                  "max": 0,
                  "min": 0
                }
              },
              "capacity": {
                "units": {
                  "max": 4,
                  "min": 1
                }
              },
              "durationSeconds": {
                "max": 300,
                "min": 1
              },
              "kind": "local-comparison-only",
              "label": "C002 synthetic fixture: not Azure authorization or universal defaults",
              "load": {
                "concurrentUsers": {
                  "max": 20,
                  "min": 1
                },
                "requestsPerSecond": {
                  "max": 100,
                  "min": 1
                }
              }
            },
            "record": {
              "acknowledgedUnits": 1,
              "completedStep": "prepare",
              "pendingStep": "advance",
              "status": "prepared"
            },
            "runId": "synthetic-run-001",
            "schemaVersion": 1
          },
          "acknowledgment": {
            "epoch": 1,
            "kind": "local-file-write-receipt",
            "published": true,
            "regularFileFlushed": true,
            "runId": "synthetic-run-001",
            "schemaVersion": 1,
            "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
          },
          "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57",
          "history": [
            {
              "epoch": 1,
              "stateSha256": "bd0ae163641540855c091f8fe367f07378ecd1befdd52c47ae795de395c69d57"
            }
          ],
          "source": "read-and-verified-immutable-files",
          "writesPerformed": 0,
          "directoryDurability": "not-guaranteed",
          "powerLossGuarantee": false
        }
      },
      "exactOwnedScratchCleaned": true,
      "externalBusinessExactlyOnce": false,
      "cloudTransaction": false
    }
  ]
});
}));
