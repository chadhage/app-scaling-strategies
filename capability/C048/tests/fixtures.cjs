'use strict';

const source = require('../../C020/contract.js');
const compatibility = require('../../C021/compatibility.js');
const ledger = require('../../C023/ledger.js');

function candidate() {
  return {
    schema: 'C048/candidate/1', releaseId: 'release-001', implementation: 'v1', profileId: 'synthetic-001',
    data: {
      apiContract: source.apiContract, consumerId: 'old-profile/1', consumerSchema: source.apiContract,
      adapterId: 'none', evidence: 'bundled-catalog'
    },
    event: {
      stateSchema: ledger.contract.schema, workVersion: ledger.contract.workVersion,
      consumerId: 'profile-effects-consumer/1', consumerStateSchema: ledger.contract.schema,
      consumerWorkVersion: ledger.contract.workVersion, evidence: 'modeled-plan'
    }
  };
}

function command(session, type, value, requestId = `request-${session.read().revision + 1}`) {
  const result = {
    schema: 'C048/command/1', type, requestId, expectedRevision: session.read().revision
  };
  if (type !== 'reset') result.candidateJSON = typeof value === 'string' ? value : JSON.stringify(value);
  return result;
}

module.exports = { candidate, command, adapterId: compatibility.adapterId };
