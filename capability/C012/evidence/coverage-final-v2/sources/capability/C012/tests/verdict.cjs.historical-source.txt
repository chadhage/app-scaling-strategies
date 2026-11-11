'use strict';
function classify(definition, observation) {
  if (definition.identity) return 'nonkill-identity';
  if (definition.syntax) return 'nonkill-syntax';
  if (observation.faults.length) return 'nonkill-runtime-module-environment-fault';
  if (observation.failures.length) return 'named-assertion-kill';
  return 'survivor-unresolved';
}
module.exports = { classify };
