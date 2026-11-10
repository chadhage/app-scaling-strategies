'use strict';

const FIELDS = Object.freeze([
  'phase', 'armed', 'requestedTicks', 'requests', 'starts', 'blockCalls', 'completions',
  'beforeArmConnections', 'clockBefore', 'clockAfter',
]);

function createStallObserver({ requestedTicks, now, block }) {
  if (!Number.isInteger(requestedTicks) || requestedTicks < 1 || requestedTicks > 60000
    || typeof now !== 'function' || typeof block !== 'function') throw new TypeError('Invalid counted stall adapters.');
  let phase = 0;
  let beforeArmConnections = 0;
  let state = { armed: false };
  const arm = () => {
    phase += 1;
    state = { phase, armed: true, requestedTicks, requests: 1, starts: 0, blockCalls: 0, completions: 0, clockBefore: null, clockAfter: null };
  };
  const connection = () => {
    if (!state.armed) { beforeArmConnections += 1; return; }
    if (state.starts !== 0) return;
    state.starts += 1;
    state.clockBefore = now();
    state.blockCalls += 1;
    block(requestedTicks);
    state.clockAfter = now();
    state.completions += 1;
  };
  const snapshot = () => Object.freeze({ ...state, beforeArmConnections });
  return Object.freeze({ arm, connection, snapshot });
}

function observationProblems(facts, requestedTicks) {
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) return ['STALL_OBSERVATION_MISSING'];
  const errors = [];
  if (Object.keys(facts).sort().join(',') !== [...FIELDS].sort().join(',')) errors.push('STALL_OBSERVATION_SHAPE');
  if (facts.armed !== true || !Number.isInteger(facts.phase) || facts.phase < 1) errors.push('STALL_NOT_ARMED');
  if (facts.requestedTicks !== requestedTicks || facts.requests !== 1) errors.push('STALL_REQUEST_MISMATCH');
  if (facts.starts !== 1 || facts.blockCalls !== 1 || facts.completions !== 1) errors.push('STALL_NOT_EXERCISED_ONCE');
  if (!Number.isInteger(facts.beforeArmConnections) || facts.beforeArmConnections < 0) errors.push('STALL_CONNECTION_COUNT');
  return errors;
}

module.exports = Object.freeze({ FIELDS, createStallObserver, observationProblems });
