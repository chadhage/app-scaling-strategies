'use strict';

const { restore } = require('..\\C015\\store.cjs');
const { FixtureError } = require('..\\C015\\contract.cjs');
const types = require('./errors.js');

function projectContext(input) {
  const item = types.record(input, ['runId', 'epoch', 'pendingStep']);
  if (!item) return { runId: null, epoch: null, pendingStep: null };
  return {
    runId: types.runIds.includes(item.runId) ? item.runId : null,
    epoch: types.epochs.includes(item.epoch) ? item.epoch : null,
    pendingStep: types.pendingSteps.includes(item.pendingStep) ? item.pendingStep : null,
  };
}

function projectError(error, input, priorAcknowledgment) {
  let code = null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    if (error instanceof FixtureError && descriptor && Object.hasOwn(descriptor, 'value') &&
        types.knownCodes.includes(descriptor.value)) code = descriptor.value;
  } catch {
    code = null;
  }
  const result = types.failure({
    schemaVersion: 1, kind: 'C019-typed-failure',
    error: code === null
      ? { source: 'C019', name: null, code: 'UNRECOGNIZED_ERROR' }
      : { source: 'C015', name: 'C015FixtureError', code },
    context: projectContext(input),
    priorAcknowledgment: types.acknowledgment(priorAcknowledgment),
    provenance: 'actual-C015-API',
  });
  if (!result) throw new TypeError('A bounded error projection is required.');
  return result;
}

async function inspect(namespace, input, priorAcknowledgment = null) {
  const request = types.record(input, ['runId', 'epoch', 'pendingStep']);
  if (!request) throw new TypeError('Explicit closed inspection context is required.');
  try {
    const receipt = await restore(namespace, request.runId);
    const observed = types.readData({
      schemaVersion: 1, kind: 'C019-read-data', provenance: 'actual-C015-API',
      acknowledgment: receipt.acknowledgment, writesPerformed: receipt.writesPerformed,
      recoveryConfirmed: false,
    });
    if (!observed) throw new TypeError('The C015 public restore schema was not established.');
    return observed;
  } catch (error) {
    return projectError(error, request, priorAcknowledgment);
  }
}

module.exports = Object.freeze({ inspect, projectError, projectContext });
