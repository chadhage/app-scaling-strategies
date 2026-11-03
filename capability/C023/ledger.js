(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../C020/contract.js'));
  else Object.defineProperty(root, 'C023Ledger', { value: factory(root.C020Contract) });
}(globalThis, function (sourceContract) {
  'use strict';

  const contract = freeze({
    schema: 'C023/1', fixtureRevision: 'C023-r1', workVersion: 'profile-effects/1',
    maximumRecords: 64, maximumSnapshotCharacters: 524288,
    effectKinds: ['profile-audit', 'preference-audit', 'completion-receipt'],
    interruptionPoints: ['none', 'before-commit', 'after-commit', 'before-checkpoint', 'after-checkpoint', 'unknown-ack'],
    atomicity: 'One modeled local effect application and its deduplication ledger entry are an atomic pair; a checkpoint is a separate later event. No durable or external transaction is implemented.'
  });

  function reject(code, message) {
    const error = new Error(message);
    error.name = 'LedgerError';
    error.code = code;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function data(value, code) {
    let remaining = 30000;
    const ancestors = new Set();
    function copy(item, depth) {
      if (--remaining < 0 || depth > 18) throw new Error('Data exceeds the bounded JSON envelope.');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'string' && item.length <= 8192) return item;
      if (typeof item === 'number' && Number.isSafeInteger(item) && !Object.is(item, -0)) return item;
      if (!item || typeof item !== 'object' || ancestors.has(item)) throw new Error('Expected finite, acyclic JSON data.');
      const prototype = Object.getPrototypeOf(item);
      if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
        throw new Error('Custom object prototypes are not accepted.');
      }
      if (Array.isArray(item) && prototype !== Array.prototype) throw new Error('Custom array prototypes are not accepted.');
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const names = Reflect.ownKeys(descriptors);
      if (names.some((name) => typeof name !== 'string' || !Object.hasOwn(descriptors[name], 'value'))) {
        throw new Error('Accessors and symbol properties are not accepted.');
      }
      ancestors.add(item);
      let result;
      if (Array.isArray(item)) {
        if (item.length > 2048 || names.length !== item.length + 1 ||
            Array.from({ length: item.length }, (_, index) => String(index)).some((name) => !descriptors[name]?.enumerable)) {
          throw new Error('Only bounded dense JSON arrays are accepted.');
        }
        result = Array.from({ length: item.length }, (_, index) => copy(descriptors[index].value, depth + 1));
      } else {
        if (names.length > 64 || names.some((name) => !descriptors[name].enumerable ||
            ['__proto__', 'constructor', 'prototype'].includes(name))) {
          throw new Error('Unexpected non-JSON object fields.');
        }
        result = {};
        for (const name of names) result[name] = copy(descriptors[name].value, depth + 1);
      }
      ancestors.delete(item);
      return result;
    }
    try { return copy(value, 0); }
    catch (error) { reject(code, error.message); }
  }

  function shape(value, fields, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) {
      reject(code, `Expected exactly these own data fields: ${fields.join(', ')}.`);
    }
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function planFor(input) {
    const config = data(input, 'INVALID_CONFIG');
    shape(config, ['jobId', 'workVersion', 'profileId', 'implementation'], 'INVALID_CONFIG');
    if (typeof config.jobId !== 'string' || !/^job-[a-z0-9][a-z0-9-]{0,27}$/.test(config.jobId)) {
      reject('INVALID_JOB_ID', 'Use an explicit job- identifier with 1–28 lowercase letters, digits or hyphens after the prefix.');
    }
    if (config.workVersion !== contract.workVersion) reject('UNSUPPORTED_WORK_VERSION', 'Select the explicit supported work version profile-effects/1.');
    if (!sourceContract || !Object.isFrozen(sourceContract) || sourceContract.apiContract !== 'getProfile/1' ||
        !Object.isFrozen(sourceContract.profiles) || !Object.isFrozen(sourceContract.stamps)) {
      reject('C020_UNAVAILABLE', 'The unchanged immutable C020 contract is required; no fallback profile is fabricated.');
    }
    if (typeof config.implementation !== 'string' || !['v1', 'v2'].includes(config.implementation)) {
      reject('UNKNOWN_IMPLEMENTATION', 'Select the explicit C020 v1 or v2 source implementation.');
    }
    const profile = sourceContract.profiles.find((item) => item.id === config.profileId);
    if (typeof config.profileId !== 'string' || !profile) reject('UNKNOWN_PROFILE', 'Select an existing synthetic profile from C020.');
    const stamp = sourceContract.stamps[config.implementation];
    if (!Object.isFrozen(profile) || !Object.isFrozen(stamp)) reject('C020_UNAVAILABLE', 'C020 source data and stamps must be immutable.');
    const workId = `${config.jobId}|${config.workVersion}|${config.profileId}`;
    return {
      ...config, workId, fixtureRevision: contract.fixtureRevision,
      source: {
        cardId: 'C020', observation: 'bundled-immutable-catalog-not-new-HTTP-observation',
        apiContract: sourceContract.apiContract,
        profile: data(profile, 'C020_UNAVAILABLE'), stamp: data(stamp, 'C020_UNAVAILABLE')
      },
      effects: contract.effectKinds.map((kind, index) => ({
        index, kind, key: `${workId}|${kind}`,
        value: { kind, profileId: profile.id, workVersion: config.workVersion, catalogVersion: stamp.profileCatalogVersion }
      }))
    };
  }

  function initialView() {
    return {
      status: 'ready', checkpointNext: 0, lastEvent: 0,
      ledger: [], applications: [], checkpoints: [], attempts: [], pendingUnknown: null,
      counters: {
        plannedEffects: 3, committedEffects: 0, effectApplications: 0, checkpoints: 0,
        attempts: 0, deliveryAttempts: 0, duplicateSuppressions: 0, unknownEffects: 0,
        reconciliationObservations: 0
      }
    };
  }

  function commandFor(input) {
    const command = data(input, 'INVALID_COMMAND');
    if (command?.type === 'run' || command?.type === 'resume') {
      shape(command, ['type', 'interruption', 'effectIndex'], 'INVALID_COMMAND');
      if (!contract.interruptionPoints.includes(command.interruption)) reject('INVALID_COMMAND', 'Select an explicit supported interruption boundary.');
      if (command.interruption === 'none' ? command.effectIndex !== null :
        !Number.isInteger(command.effectIndex) || command.effectIndex < 0 || command.effectIndex >= contract.effectKinds.length) {
        reject('INVALID_COMMAND', 'An interruption needs an integer effect index 0–2; none requires null.');
      }
    } else if (command?.type === 'reconcile') {
      shape(command, ['type', 'effectKey', 'observation'], 'INVALID_COMMAND');
      if (typeof command.effectKey !== 'string' ||
          !['still-unknown', 'observed-committed', 'observed-absent'].includes(command.observation)) {
        reject('INVALID_COMMAND', 'Reconciliation requires an exact effect key and an explicit synthetic observation.');
      }
    } else reject('INVALID_COMMAND', 'Only run, resume and reconcile commands are supported.');
    return command;
  }

  function execute(plan, previous, input) {
    const command = commandFor(input);
    const view = data(previous, 'INVALID_STATE');
    const events = [];
    function emit(type, details) {
      const event = { sequence: ++view.lastEvent, type, ...details };
      events.push(event);
      return event.sequence;
    }
    function committed(effect) {
      return view.ledger.some((entry) => entry.effectKey === effect.key);
    }
    function commit(effect, attemptId, origin) {
      if (committed(effect)) reject('INVALID_STATE', 'A known committed effect cannot be applied twice.');
      const sequence = emit('effect-committed', { effectKey: effect.key, index: effect.index, attemptId, origin });
      // This pair is the fixture's atomicity assumption, not a durable/external transaction.
      view.ledger.push({ effectKey: effect.key, index: effect.index, attemptId, commitEvent: sequence, origin });
      view.applications.push({ effectKey: effect.key, ordinal: view.applications.length + 1, value: effect.value, origin });
    }
    if (command.type === 'reconcile') {
      if (view.status !== 'needs-reconcile' || !view.pendingUnknown) reject('INVALID_STATE_TRANSITION', 'There is no unresolved acknowledgment to reconcile.');
      if (command.effectKey !== view.pendingUnknown.effectKey) reject('RECONCILIATION_KEY_MISMATCH', 'The observation must match the exact unresolved effect key.');
      const pending = view.pendingUnknown;
      emit('synthetic-reconciliation-observed', {
        effectKey: pending.effectKey, observation: command.observation, evidenceKind: 'synthetic-operator-choice-not-external-receipt'
      });
      view.counters.reconciliationObservations++;
      if (command.observation !== 'still-unknown') {
        if (command.observation === 'observed-committed') commit(plan.effects[pending.index], pending.attemptId, 'synthetic-reconciliation');
        view.pendingUnknown = null;
        view.status = 'interrupted';
      }
    } else {
      if (view.status === 'needs-reconcile') reject('NEEDS_RECONCILIATION', 'Unknown acknowledgment: reconcile explicitly before any retry; success is not assumed.');
      if (command.type === 'run' ? view.status !== 'ready' : view.status !== 'interrupted') {
        reject('INVALID_STATE_TRANSITION', 'Run requires a new job; resume requires an interrupted, reconciled job.');
      }
      const target = command.effectIndex;
      if (target !== null && target < view.checkpointNext) reject('INVALID_INTERRUPTION_TARGET', 'The selected effect is before the saved checkpoint.');
      if (target !== null && committed(plan.effects[target]) &&
          ['before-commit', 'after-commit', 'unknown-ack'].includes(command.interruption)) {
        reject('UNREACHABLE_INTERRUPTION', 'That effect is already known committed and must be suppressed, not committed again.');
      }
      const attemptId = `attempt-${String(view.attempts.length + 1).padStart(3, '0')}`;
      const attempt = {
        id: attemptId, action: command.type, fromCheckpoint: view.checkpointNext,
        startEvent: emit('attempt-started', { attemptId, action: command.type, fromCheckpoint: view.checkpointNext }),
        outcome: 'running', interruption: null, finishEvent: null
      };
      view.attempts.push(attempt);
      function finish(outcome) {
        attempt.outcome = outcome;
        attempt.finishEvent = emit('attempt-finished', { attemptId, outcome });
      }
      function interrupt(boundary, index) {
        attempt.interruption = { boundary, index };
        emit('interrupted', { attemptId, boundary, index });
        view.status = 'interrupted';
        finish('interrupted');
      }
      for (let index = view.checkpointNext; index < plan.effects.length; index++) {
        const effect = plan.effects[index];
        const stop = (boundary) => target === index && command.interruption === boundary;
        emit('effect-requested', { attemptId, effectKey: effect.key, index });
        view.counters.deliveryAttempts++;
        if (stop('before-commit')) { interrupt('before-commit', index); break; }
        if (committed(effect)) {
          emit('duplicate-suppressed', { attemptId, effectKey: effect.key, index, proof: 'known-local-ledger-entry' });
          view.counters.duplicateSuppressions++;
        } else if (stop('unknown-ack')) {
          const sequence = emit('acknowledgment-unknown', {
            attemptId, effectKey: effect.key, index, interpretation: 'not-counted-as-known-committed'
          });
          view.pendingUnknown = { effectKey: effect.key, index, attemptId, event: sequence };
          attempt.interruption = { boundary: 'unknown-ack', index };
          view.status = 'needs-reconcile';
          finish('unknown');
          break;
        } else commit(effect, attemptId, 'local-atomic-pair');
        if (stop('after-commit')) { interrupt('after-commit', index); break; }
        emit('effect-acknowledged', { attemptId, effectKey: effect.key, index, scope: 'known-local-ledger-only' });
        if (stop('before-checkpoint')) { interrupt('before-checkpoint', index); break; }
        const sequence = emit('checkpoint-recorded', { attemptId, afterEffectKey: effect.key, nextIndex: index + 1 });
        view.checkpointNext = index + 1;
        view.checkpoints.push({ ordinal: view.checkpoints.length + 1, attemptId, nextIndex: index + 1, afterEffectKey: effect.key, event: sequence });
        if (stop('after-checkpoint')) { interrupt('after-checkpoint', index); break; }
      }
      if (attempt.outcome === 'running') {
        view.status = 'complete';
        finish('complete');
      }
    }
    Object.assign(view.counters, {
      plannedEffects: plan.effects.length, committedEffects: view.ledger.length,
      effectApplications: view.applications.length, checkpoints: view.checkpoints.length,
      attempts: view.attempts.length, unknownEffects: view.pendingUnknown ? 1 : 0
    });
    return { command, events, view };
  }

  function create(config) {
    return freeze({ schema: contract.schema, plan: planFor(config), journal: [], view: initialView() });
  }

  function validated(input) {
    const candidate = data(input, 'INVALID_STATE');
    shape(candidate, ['schema', 'plan', 'journal', 'view'], 'INVALID_STATE');
    if (candidate.schema !== contract.schema || !Array.isArray(candidate.journal) || candidate.journal.length > contract.maximumRecords) {
      reject('INVALID_STATE', 'Unknown schema or unbounded journal.');
    }
    let plan;
    try {
      plan = planFor({
        jobId: candidate.plan?.jobId, workVersion: candidate.plan?.workVersion,
        profileId: candidate.plan?.profileId, implementation: candidate.plan?.implementation
      });
    } catch (error) { reject('INVALID_STATE', `Invalid saved plan: ${error.message}`); }
    if (canonical(plan) !== canonical(candidate.plan)) reject('INVALID_STATE', 'Saved plan or C020 lineage differs from its immutable source.');
    let view = initialView();
    const journal = [];
    for (const record of candidate.journal) {
      shape(record, ['ordinal', 'command', 'events'], 'INVALID_STATE');
      let next;
      try { next = execute(plan, view, record.command); }
      catch (error) { reject('INVALID_STATE', `Impossible journal transition: ${error.code}.`); }
      const expected = { ordinal: journal.length + 1, command: next.command, events: next.events };
      if (canonical(expected) !== canonical(record)) reject('INVALID_STATE', 'Journal order or event evidence was modified.');
      journal.push(expected);
      view = next.view;
    }
    if (canonical(view) !== canonical(candidate.view)) reject('INVALID_STATE', 'Checkpoint, ledger, effects, outcomes or counts do not match the complete journal.');
    return freeze({ schema: contract.schema, plan, journal, view });
  }

  function apply(state, input) {
    const original = validated(state);
    if (original.journal.length >= contract.maximumRecords) reject('HISTORY_LIMIT', 'This bounded fixture allows at most 64 commands; archive it rather than discarding history.');
    const next = execute(original.plan, original.view, input);
    return freeze({
      schema: contract.schema, plan: original.plan,
      journal: [...original.journal, { ordinal: original.journal.length + 1, command: next.command, events: next.events }],
      view: next.view
    });
  }

  function inspect(state) { return validated(state).view; }

  function restore(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > contract.maximumSnapshotCharacters) {
      reject('INVALID_SNAPSHOT', 'Supply explicit JSON of at most 524288 characters.');
    }
    let value;
    try { value = JSON.parse(text); }
    catch { reject('INVALID_SNAPSHOT', 'The saved snapshot is not valid JSON.'); }
    return validated(value);
  }

  return freeze({ contract, create, apply, inspect, restore });
}));
