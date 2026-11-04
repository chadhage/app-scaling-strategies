'use strict';

async function open() {
  const attached = [];
  const history = [];
  return Object.freeze({
    getEvidence(id) {
      return {
        schemaVersion: 1, evidenceKind: 'closed-fictional-correlation/1',
        leaseId: 'fictional-C036-lease-001', userId: 'fictional-C036-user-001',
        runId: id === 'wrong-run' ? 'synthetic-run-002' : 'synthetic-run-001',
        epoch: 3, observations: ['frontend', 'getProfile-v1', 'getProfile-v2']
      };
    },
    async attachText(text) {
      const candidate = JSON.parse(text);
      attached.push(...candidate.observations);
      const result = { outcome: 'attached', code: 'ATTRIBUTED', attributedRecords: attached.length };
      history.push(result);
      return result;
    },
    snapshot() {
      return {
        attachedRecords: attached.length,
        metrics: { currentAttributedTierRecords: attached.length },
        history: [...history]
      };
    }
  });
}

module.exports = Object.freeze({ open });
