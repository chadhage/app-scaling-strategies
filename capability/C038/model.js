(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('..\\C020\\contract.js'));
  else Object.defineProperty(root, 'C038Model', { value: factory(root.C020Contract) });
}(globalThis, function (contract) {
  'use strict';
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const modelId = 'C038-closed-fictional-two-instance-model/1';
  const instances = ['v1', 'v2'].map((implementation, index) => ({
    id: `fictional-C038-node-${index === 0 ? 'a' : 'b'}`,
    tier: `getProfile-${implementation}`,
    version: {
      implementation,
      implementationVersion: contract.stamps[implementation].implementationVersion,
      apiContract: contract.apiContract,
      deploymentStamp: contract.stamps[implementation].deploymentStamp
    },
    requiredProbes: ['service', 'catalog', 'cache']
  }));
  const inventory = freeze({
    schemaVersion: 1, id: 'fictional-C038-inventory-r1', complete: true,
    scope: 'CLOSED_SYNTHETIC_NOT_ACTUAL_POOL',
    declaration: 'Two explicitly fictional nodes; version labels do not discover or attest actual instances.',
    instances,
    dependencies: [
      { id: 'fictional-C038-catalog', version: 'synthetic-profiles/1', requiredBy: instances.map((item) => item.id) },
      { id: 'fictional-C038-cache', version: 'C038-fictional-cache/1', requiredBy: instances.map((item) => item.id) }
    ]
  });
  const clock = freeze({
    id: 'fictional-C038-clock-001', kind: 'declared-fictional-ticks',
    nowTick: 100, ttlTicks: 10, uncertaintyTicks: 0,
    freshnessContract: '0 <= nowTick - observedTick < ttlTicks; equality is STALE'
  });
  const source = freeze({
    kind: 'explicit-C038-closed-synthetic-observation-model', modelId,
    inventoryOrigin: 'literal-fictional-inventory-not-a-scan',
    timeOrigin: 'declared-fictional-clock-not-native-attestation',
    c020VersionsAreLabelsOnly: true, actualHistoryJoinedToCurrentLease: false,
    actualInstancesAttested: false, nativeFreshnessAttested: false
  });
  const ids = freeze([
    'single-probe', 'complete', 'failed-node', 'stale-node', 'partial',
    'missing-inventory', 'missing-node', 'missing-dependency', 'missing-request',
    'missing-freshness', 'unknown-clock', 'future-timestamp', 'ambiguous-clock',
    'duplicate-node', 'wrong-version', 'wrong-tier', 'wrong-context', 'old-epoch',
    'before-ttl', 'at-ttl', 'after-ttl', 'unknown-state', 'later-fresh',
    'missing-probe', 'missing-source', 'missing-epoch', 'status-only',
    'saved-closed-unlinked', 'saved-held-unlinked'
  ]);
  const rounds = freeze(ids.filter((id) => !id.startsWith('saved-'))
    .map((id, index) => `fictional-C038-round-${String(index + 1).padStart(2, '0')}`));
  function ownerContext(context) {
    return {
      fixtureNamespace: context.fixtureNamespace, runId: context.runId,
      epoch: context.epoch, epochVersion: context.epochVersion, stateSha256: context.stateSha256,
      association: 'declared-C015-fixture-association-only',
      modelContextId: 'fictional-C038-context-001'
    };
  }
  function dependency(probe) {
    return probe === 'service' ? { id: 'self', version: 'C038-fictional-service/1' } :
      { id: inventory.dependencies[probe === 'catalog' ? 0 : 1].id,
        version: inventory.dependencies[probe === 'catalog' ? 0 : 1].version };
  }
  function requestId(roundId, instanceId, probeId) { return `${roundId}:${instanceId}:${probeId}:request`; }
  function observationId(roundId, instanceId, probeId) { return `${roundId}:${instanceId}:${probeId}:observation`; }
  function candidate(id, context) {
    if (arguments.length !== 2 || !ids.includes(id) || id.startsWith('saved-')) throw new Error('UNKNOWN_CLOSED_FIXTURE');
    const roundId = rounds[ids.indexOf(id)];
    const expected = ownerContext(context);
    const value = {
      schemaVersion: 1, kind: 'C038-closed-synthetic-observations/1', modelId,
      roundId, inventory: structuredClone(inventory), clock: structuredClone(clock),
      source: structuredClone(source), context: structuredClone(expected),
      observations: inventory.instances.flatMap((instance) => instance.requiredProbes.map((probeId) => ({
        id: observationId(roundId, instance.id, probeId), originalId: roundId,
        instanceId: instance.id, probeId, tier: instance.tier,
        version: structuredClone(instance.version), dependency: dependency(probeId),
        context: structuredClone(expected), source: structuredClone(source),
        request: { id: requestId(roundId, instance.id, probeId), sentTick: 94, clockId: clock.id },
        response: {
          requestId: requestId(roundId, instance.id, probeId), observedTick: 95,
          clockId: clock.id, complete: true, httpStatus: 200, state: 'ready'
        }
      })))
    };
    const first = value.observations[0];
    if (id === 'single-probe') value.observations = [first];
    if (id === 'failed-node') value.observations.at(-1).response.state = 'failed';
    if (id === 'stale-node') {
      value.observations.at(-1).request.sentTick = 89;
      value.observations.at(-1).response.observedTick = 90;
    }
    if (id === 'partial') value.observations.at(-1).response.complete = false;
    if (id === 'missing-inventory') delete value.inventory;
    if (id === 'missing-node') {
      value.inventory.instances.pop();
      value.observations = value.observations.filter((item) => item.instanceId === instances[0].id);
    }
    if (id === 'missing-dependency') value.inventory.dependencies.pop();
    if (id === 'missing-request') delete first.request;
    if (id === 'missing-freshness') delete first.response.observedTick;
    if (id === 'unknown-clock') value.clock.kind = 'unknown';
    if (id === 'future-timestamp') first.response.observedTick = 101;
    if (id === 'ambiguous-clock') value.clock.uncertaintyTicks = 1;
    if (id === 'duplicate-node') value.observations = [first, structuredClone(first), ...value.observations.slice(2)];
    if (id === 'wrong-version') first.version.implementationVersion = '99.0.0';
    if (id === 'wrong-tier') first.tier = instances[1].tier;
    if (id === 'wrong-context') first.context.modelContextId = 'fictional-C038-other-context';
    if (id === 'old-epoch') first.context.epoch = context.epoch === 1 ? 2 : context.epoch - 1;
    if (['before-ttl', 'at-ttl', 'after-ttl'].includes(id)) {
      const observedTick = { 'before-ttl': 91, 'at-ttl': 90, 'after-ttl': 89 }[id];
      for (const item of value.observations) {
        item.request.sentTick = observedTick - 1;
        item.response.observedTick = observedTick;
      }
    }
    if (id === 'unknown-state') first.response.state = 'unknown';
    if (id === 'later-fresh') for (const item of value.observations) {
      item.request.sentTick = 98;
      item.response.observedTick = 99;
    }
    if (id === 'missing-probe') value.observations.pop();
    if (id === 'missing-source') delete first.source;
    if (id === 'missing-epoch') delete first.context.epoch;
    if (id === 'status-only') {
      value.observations = [{ response: { httpStatus: 200 } }];
      delete value.inventory;
    }
    return value;
  }
  return freeze({ modelId, inventory, clock, source, ids, rounds, ownerContext, dependency,
    requestId, observationId, candidate });
}));
