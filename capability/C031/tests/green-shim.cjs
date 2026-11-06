'use strict';

// Preload for the GREEN replay: the archived RED test asks for ./evaluator.stub.cjs; this hands it the real evaluator,
// projected to the minimal shape the RED assertions read. The RED file itself is executed byte-for-byte unchanged.
const Module = require('node:module');
const path = require('node:path');
const evaluator = require('..\\evaluator.js');

const stub = path.join(__dirname, '..', 'evidence', 'red', 'evaluator.stub.cjs');
const projection = Object.freeze({
  evaluateFleet(fleet) {
    const report = evaluator.evaluateFleet(fleet);
    return {
      valid: report.valid,
      clients: report.clients.map(({ clientId, classification }) => ({ clientId, classification })),
      counts: { unchanged: report.counts.unchanged, failedOrUnknown: report.counts.failedOrUnknown },
      successRate: { numerator: report.successRate.numerator, denominator: report.successRate.denominator }
    };
  }
});
const original = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent && parent.filename && path.resolve(path.dirname(parent.filename), request) === stub) return projection;
  return original.call(this, request, parent, isMain);
};
