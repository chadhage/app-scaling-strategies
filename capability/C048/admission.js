(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C020/contract.js'), require('../C020/inspector.js'),
      require('../C021/compatibility.js'), require('../C023/ledger.js'));
  } else {
    Object.defineProperty(root, 'C048Admission', {
      value: factory(root.C020Contract, root.C020Inspector, root.C021Compatibility, root.C023Ledger)
    });
  }
}(globalThis, function (source, inspector, compatibility, ledger) {
  'use strict';
  const rules = freeze({
    candidateSchema: 'C048/candidate/1', commandSchema: 'C048/command/1',
    sessionSchema: 'C048/session/1', maximumOperations: 64, maximumCandidateCharacters: 16384,
    dataConsumers: [
      { id: 'old-profile/1', schema: 'getProfile/1' },
      { id: 'new-profile/2', schema: 'getProfile/2' }
    ],
    eventConsumer: {
      id: 'profile-effects-consumer/1', stateSchema: 'C023/1', workVersion: 'profile-effects/1',
      plannedEffectFields: ['index', 'kind', 'key', 'value'],
      valueFields: ['kind', 'profileId', 'workVersion', 'catalogVersion'],
      committedEventFields: ['sequence', 'type', 'effectKey', 'index', 'attemptId', 'origin']
    },
    scope: 'local-compatibility-only',
    notAssessed: ['runtime-health', 'HTTP-status', 'capacity', 'authorization', 'business-acknowledgment']
  });

  function reject(code, message) {
    const error = new Error(message);
    error.name = 'AdmissionError';
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

  function detach(value) { return freeze(JSON.parse(JSON.stringify(value))); }

  function data(value, code) {
    let nodes = 0;
    let characters = 0;
    const ancestors = new Set();
    function copy(item, depth) {
      if (++nodes > 4096 || depth > 12) reject(code, 'Input exceeds the bounded C048 data shape.');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'string') {
        characters += item.length;
        if (item.length > rules.maximumCandidateCharacters || characters > 32768) {
          reject(code, 'Input exceeds the bounded C048 text envelope.');
        }
        return item;
      }
      if (typeof item === 'number' && Number.isSafeInteger(item) && !Object.is(item, -0)) return item;
      if (!item || typeof item !== 'object' || ancestors.has(item)) reject(code, 'Only finite acyclic JSON data is accepted.');
      const array = Array.isArray(item);
      const prototype = Object.getPrototypeOf(item);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
        reject(code, 'Custom or inherited prototypes are not C048 input.');
      }
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) {
        reject(code, 'Accessors and symbol fields are not accepted.');
      }
      const length = array ? descriptors.length.value : 0;
      if (array && (length > 64 || keys.length !== length + 1 ||
          Array.from({ length }, (_, index) => String(index)).some((key) => !descriptors[key]?.enumerable))) {
        reject(code, 'Only bounded dense JSON arrays without extra fields are accepted.');
      }
      const fields = array ? keys.filter((key) => key !== 'length') : keys;
      if (fields.length > 64 || fields.some((key) => !descriptors[key].enumerable ||
          ['__proto__', 'constructor', 'prototype'].includes(key))) {
        reject(code, 'Unexpected non-JSON record fields.');
      }
      ancestors.add(item);
      const result = array ? [] : {};
      for (const field of fields) result[field] = copy(descriptors[field].value, depth + 1);
      ancestors.delete(item);
      return result;
    }
    return copy(value, 0);
  }

  function shape(value, fields, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) {
      reject(code, `Expected exactly these fields: ${fields.join(', ')}.`);
    }
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function uniqueJSONKeys(text) {
    const stack = [];
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === '{' || character === '[') stack.push(character === '{' ? new Set() : null);
      else if (character === '}' || character === ']') stack.pop();
      else if (character === '"') {
        const start = index++;
        while (text[index] !== '"') {
          if (text[index] === '\\') index++;
          index++;
        }
        let after = index + 1;
        while (/\s/.test(text[after] || '') && after < text.length) after++;
        if (text[after] === ':') {
          const key = JSON.parse(text.slice(start, index + 1));
          const keys = stack[stack.length - 1];
          if (keys.has(key)) reject('INVALID_JSON', 'Duplicate JSON fields are ambiguous evidence.');
          keys.add(key);
        }
      }
    }
  }

  function parseCandidate(text) {
    if (typeof text !== 'string' || text.length === 0 || text.length > rules.maximumCandidateCharacters) {
      reject('INVALID_JSON', 'Supply explicit candidate JSON of 1–16384 characters.');
    }
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { reject('INVALID_JSON', 'Candidate JSON is malformed.'); }
    uniqueJSONKeys(text);
    const value = data(parsed, 'INVALID_CANDIDATE');
    shape(value, ['schema', 'releaseId', 'implementation', 'profileId', 'data', 'event'], 'INVALID_CANDIDATE');
    if (value.schema !== rules.candidateSchema) reject('UNKNOWN_CANDIDATE_SCHEMA', 'The candidate requires C048/candidate/1.');
    if (typeof value.releaseId !== 'string' || !/^release-[a-z0-9][a-z0-9-]{0,19}$/.test(value.releaseId)) {
      reject('INVALID_RELEASE_ID', 'Supply an explicit release- identifier with a 1–20 character lowercase suffix.');
    }
    if (typeof value.implementation !== 'string' || typeof value.profileId !== 'string') {
      reject('INVALID_CANDIDATE', 'Implementation and profile identifiers must be explicit strings.');
    }
    shape(value.data, ['apiContract', 'consumerId', 'consumerSchema', 'adapterId', 'evidence'], 'INVALID_CANDIDATE');
    shape(value.event, ['stateSchema', 'workVersion', 'consumerId', 'consumerStateSchema', 'consumerWorkVersion', 'evidence'],
      'INVALID_CANDIDATE');
    if ([value.implementation, value.profileId, ...Object.values(value.data), ...Object.values(value.event)]
      .some((field) => typeof field !== 'string' || field.length === 0 || field.length > 128)) {
      reject('INVALID_CANDIDATE', 'Every declared identifier, schema, adapter and evidence selector is an explicit bounded string.');
    }
    return freeze(value);
  }

  function sourceResponse(candidate) {
    if (!source || !Object.isFrozen(source) || source.apiContract !== 'getProfile/1' ||
        !inspector || compatibility?.oldConsumer !== inspector.oldConsumer ||
        typeof compatibility?.makeBreaking !== 'function' || typeof ledger?.inspect !== 'function') {
      reject('DEPENDENCY_UNAVAILABLE', 'Unchanged C020, C021 and C023 models are required; there is no fallback.');
    }
    if (!['v1', 'v2'].includes(candidate.implementation)) reject('UNKNOWN_IMPLEMENTATION', 'Only explicit C020 v1 and v2 are known.');
    const profile = source.profiles.find((item) => item.id === candidate.profileId);
    if (!profile) reject('UNKNOWN_PROFILE', 'The profile must exist in the unchanged C020 catalog.');
    const response = detach({
      apiContract: source.apiContract, profile, stamp: source.stamps[candidate.implementation]
    });
    inspector.inspect(response, candidate.implementation, candidate.profileId);
    return response;
  }

  function dataEligibility(candidate) {
    const input = candidate.data;
    const consumer = rules.dataConsumers.find((item) => item.id === input.consumerId);
    if (!consumer) reject('DATA_CONSUMER_UNKNOWN', 'DATA consumers are the exact declared old-profile/1 or new-profile/2.');
    if (input.consumerSchema !== consumer.schema) reject('DATA_DECLARATION_MISMATCH', 'That DATA consumer has one exact declared schema.');
    if (input.evidence !== 'bundled-catalog') reject('DATA_EVIDENCE_UNKNOWN', 'Unknown DATA evidence cannot grant admission.');
    if (![source?.apiContract, compatibility?.newContract].includes(input.apiContract)) {
      reject('DATA_SCHEMA_UNKNOWN', 'Only getProfile/1 and explicit C021 getProfile/2 are known.');
    }
    if (!['none', compatibility.adapterId].includes(input.adapterId)) reject('ADAPTER_UNKNOWN', 'No undeclared adapter is accepted.');
    if (input.adapterId !== 'none' && (input.apiContract !== compatibility.newContract || consumer.id !== 'old-profile/1')) {
      reject('ADAPTER_NOT_APPLICABLE', 'The explicit adapter is one-way from raw getProfile/2 to the old consumer.');
    }
    const baseline = sourceResponse(candidate);
    let response = input.apiContract === source.apiContract ? baseline :
      compatibility.makeBreaking(baseline, candidate.implementation, candidate.profileId);
    if (input.adapterId === compatibility.adapterId) {
      response = compatibility.adaptToOld(response, candidate.implementation, candidate.profileId);
    }
    let semantics;
    try {
      semantics = consumer.id === 'old-profile/1' ? compatibility.oldConsumer(response) :
        compatibility.newConsumer(response, candidate.implementation, candidate.profileId);
    } catch (error) {
      if (error.code === 'CONTRACT_MISMATCH') {
        reject('DATA_INCOMPATIBLE', 'CONTRACT_MISMATCH: the actual unchanged consumer refused this raw contract.');
      }
      throw error;
    }
    if (canonical(semantics) !== canonical(inspector.oldConsumer(baseline))) {
      reject('DATA_SEMANTICS_CHANGED', 'All unchanged business fields must be preserved.');
    }
    return {
      tier: 'DATA', status: 'compatible', code: 'DATA_COMPATIBLE', consumerId: consumer.id,
      inputContract: input.apiContract, consumerSchema: consumer.schema, adapterId: input.adapterId,
      evidenceKind: 'bundled-immutable-catalog-not-HTTP-observation', semantics, sourceStamp: baseline.stamp
    };
  }

  function plannedJob(candidate) {
    return ledger.create({
      jobId: `job-${candidate.releaseId.slice(8)}`, workVersion: candidate.event.workVersion,
      profileId: candidate.profileId, implementation: candidate.implementation
    });
  }

  function consumePlan(job, candidate) {
    const view = ledger.inspect(job);
    if (job.schema !== rules.eventConsumer.stateSchema || job.plan.workVersion !== rules.eventConsumer.workVersion ||
        view.status !== 'ready' || view.counters.effectApplications !== 0 ||
        job.plan.effects.length !== ledger.contract.effectKinds.length) {
      reject('EVENT_MODEL_MISMATCH', 'The exact C023 schema and unapplied three-effect plan are required.');
    }
    job.plan.effects.forEach((effect, index) => {
      shape(effect, rules.eventConsumer.plannedEffectFields, 'EVENT_MODEL_MISMATCH');
      shape(effect.value, rules.eventConsumer.valueFields, 'EVENT_MODEL_MISMATCH');
      if (effect.index !== index || effect.kind !== ledger.contract.effectKinds[index] ||
          effect.key !== `${job.plan.workId}|${effect.kind}` ||
          canonical(effect.value) !== canonical({
            kind: effect.kind, profileId: candidate.profileId, workVersion: rules.eventConsumer.workVersion,
            catalogVersion: source.stamps[candidate.implementation].profileCatalogVersion
          })) reject('EVENT_MODEL_MISMATCH', 'Every planned event/effect field and key must match the closed consumer.');
    });
    return view;
  }

  function eventEligibility(candidate) {
    const input = candidate.event;
    const consumer = rules.eventConsumer;
    if (input.consumerId !== consumer.id) reject('EVENT_CONSUMER_UNKNOWN', 'Only the declared profile-effects-consumer/1 is known.');
    if (input.consumerStateSchema !== consumer.stateSchema || input.consumerWorkVersion !== consumer.workVersion) {
      reject('EVENT_DECLARATION_MISMATCH', 'The EVENT consumer requires exact C023/1 and profile-effects/1 declarations.');
    }
    if (input.evidence !== 'modeled-plan') reject('EVENT_EVIDENCE_UNKNOWN', 'Unknown EVENT evidence cannot grant admission.');
    if (input.stateSchema !== consumer.stateSchema) reject('EVENT_SCHEMA_INCOMPATIBLE', 'The modeled EVENT state schema must be exact C023/1.');
    if (input.workVersion !== consumer.workVersion) reject('EVENT_WORK_INCOMPATIBLE', 'The modeled work schema must be exact profile-effects/1.');
    sourceResponse(candidate);
    const job = plannedJob(candidate);
    consumePlan(job, candidate);
    return {
      tier: 'EVENT', status: 'compatible', code: 'EVENT_COMPATIBLE', consumerId: consumer.id,
      stateSchema: job.schema, workVersion: job.plan.workVersion, plannedEffects: job.plan.effects.length,
      effectKinds: ledger.contract.effectKinds,
      evidenceKind: 'local-modeled-C023-plan-not-real-queue-or-protocol-proof',
      atomicity: ledger.contract.atomicity
    };
  }

  function eligibility(candidate) {
    const checks = [
      ['DATA', dataEligibility], ['EVENT', eventEligibility]
    ].map(([tier, evaluate]) => {
      try { return evaluate(candidate); }
      catch (error) { return { tier, status: 'blocked', code: error.code || 'DEPENDENCY_FAILURE', message: error.message }; }
    });
    const blocked = checks.find((check) => check.status !== 'compatible');
    return freeze({
      status: blocked ? 'blocked' : 'eligible', code: blocked ? blocked.code : 'ELIGIBLE',
      checks, scope: rules.scope, notAssessed: rules.notAssessed
    });
  }

  function assessCandidate(text) { return eligibility(parseCandidate(text)); }

  function commandFor(input) {
    const command = data(input, 'INVALID_COMMAND');
    const withCandidate = ['inspect', 'admit', 'expand'].includes(command?.type);
    shape(command, withCandidate ? ['schema', 'type', 'requestId', 'expectedRevision', 'candidateJSON'] :
      ['schema', 'type', 'requestId', 'expectedRevision'], 'INVALID_COMMAND');
    if (command.schema !== rules.commandSchema || ![...['inspect', 'admit', 'expand'], 'reset'].includes(command.type)) {
      reject('INVALID_COMMAND', 'Select an exact C048/command/1 inspect, admit, expand or reset command.');
    }
    if (typeof command.requestId !== 'string' || !/^request-[a-z0-9][a-z0-9-]{0,23}$/.test(command.requestId) ||
        !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
        command.expectedRevision > rules.maximumOperations) {
      reject('INVALID_COMMAND', 'Supply a bounded request- identity and an explicit integer expectedRevision.');
    }
    if (withCandidate && (typeof command.candidateJSON !== 'string' ||
        command.candidateJSON.length > rules.maximumCandidateCharacters)) {
      reject('INVALID_COMMAND', 'A complete bounded candidateJSON string is required; no supplied verdict is a permit.');
    }
    return freeze(command);
  }

  function committedJob(candidate) {
    const job = ledger.apply(plannedJob(candidate), { type: 'run', interruption: 'none', effectIndex: null });
    const view = ledger.inspect(job);
    const events = job.journal.flatMap((record) => record.events).filter((event) => event.type === 'effect-committed');
    if (view.status !== 'complete' || view.counters.effectApplications !== 3 || events.length !== 3) {
      reject('EVENT_MODEL_MISMATCH', 'The accepted local C023 run must contain exactly three known modeled applications.');
    }
    events.forEach((event, index) => {
      shape(event, rules.eventConsumer.committedEventFields, 'EVENT_MODEL_MISMATCH');
      if (event.index !== index || event.effectKey !== job.plan.effects[index].key || event.origin !== 'local-atomic-pair') {
        reject('EVENT_MODEL_MISMATCH', 'The exact local committed event must match its closed declared consumer.');
      }
    });
    return job;
  }

  function initial(sessionId) {
    return {
      sessionId, revision: 0, active: null, archives: [], usedRequestIds: [],
      counts: { admissions: 0, expansions: 0, rejections: 0, inspections: 0, modeledEffectApplications: 0 }
    };
  }

  function perform(before, captured) {
    const next = JSON.parse(JSON.stringify(before));
    let operation = 'invalid';
    let outcome = 'rejected';
    let code;
    let message;
    let evidence = null;
    try {
      if (captured.invalid) reject(captured.invalid.code, captured.invalid.message);
      const command = commandFor(captured.input);
      operation = command.type;
      if (next.usedRequestIds.includes(command.requestId)) reject('REQUEST_REPLAY', 'A retained request identity cannot be replayed.');
      next.usedRequestIds.push(command.requestId);
      if (command.expectedRevision !== before.revision) reject('STALE_REVISION', 'An earlier inspection/revision cannot permit a current transition.');
      if (operation === 'reset') {
        if (next.active) next.archives.push(next.active);
        next.active = null;
        outcome = 'reset';
        code = 'RESET';
        message = 'Active admission archived; original history and lifetime modeled effects retained.';
      } else {
        const candidate = parseCandidate(command.candidateJSON);
        evidence = eligibility(candidate);
        if (evidence.status !== 'eligible') reject(evidence.code, 'At least one DATA/EVENT consumer blocks this local transition.');
        if (operation === 'inspect') {
          next.counts.inspections++;
          outcome = 'inspected';
          message = 'Eligible local inspection only; it grants no admission authority.';
        } else if (operation === 'admit') {
          if (next.active) reject('ACTIVE_ADMISSION', 'Archive/reset the active admission before creating another.');
          if (next.archives.some((item) => item.releaseId === candidate.releaseId)) {
            reject('RELEASE_REPLAY', 'A retained release/work identity cannot be reused after reset.');
          }
          const job = committedJob(candidate);
          next.active = { releaseId: candidate.releaseId, profileId: candidate.profileId, stage: 'admitted', candidate, eligibility: evidence, job };
          next.counts.admissions++;
          next.counts.modeledEffectApplications += job.view.counters.effectApplications;
          outcome = 'admitted';
          message = 'Both compatibility gates passed before local admission and the three modeled effects.';
        } else {
          if (!next.active) reject('ADMISSION_REQUIRED', 'Expansion requires a current local admission.');
          if (next.active.stage !== 'admitted') reject('ALREADY_EXPANDED', 'This closed model has one admission and one expansion per retained release.');
          if (next.active.releaseId !== candidate.releaseId || next.active.profileId !== candidate.profileId) {
            reject('RELEASE_IDENTITY_MISMATCH', 'Expansion cannot replace the retained release/profile work identity.');
          }
          ledger.inspect(next.active.job);
          next.active = { ...next.active, stage: 'expanded', candidate, eligibility: evidence };
          next.counts.expansions++;
          outcome = 'expanded';
          message = 'Fresh DATA/EVENT eligibility passed; the original complete C023 job is retained without reapplying effects.';
        }
        code = 'ELIGIBLE';
      }
    } catch (error) {
      code = error.code || 'DEPENDENCY_FAILURE';
      message = error.message;
      next.counts.rejections++;
    }
    next.revision++;
    return freeze({
      projection: next,
      result: { operation, outcome, code, message, revision: next.revision, eligibility: evidence }
    });
  }

  function createSession(config) {
    if (arguments.length !== 1) reject('INVALID_CONFIG', 'Only one closed session config is accepted.');
    const settings = data(config, 'INVALID_CONFIG');
    shape(settings, ['sessionId'], 'INVALID_CONFIG');
    if (typeof settings.sessionId !== 'string' || !/^session-[a-z0-9][a-z0-9-]{0,23}$/.test(settings.sessionId)) {
      reject('INVALID_CONFIG', 'Supply an explicit bounded session- identity.');
    }
    let records = [];
    let projection = freeze(initial(settings.sessionId));
    let terminalRejection = null;

    function verified() {
      let replay = freeze(initial(settings.sessionId));
      for (const record of records) {
        const next = perform(replay, record.captured);
        if (canonical(next.result) !== canonical(record.result)) reject('PRIVATE_REPLAY_MISMATCH', 'Private operation history did not replay exactly.');
        replay = next.projection;
      }
      if (canonical(replay) !== canonical(projection)) reject('PRIVATE_REPLAY_MISMATCH', 'Private admission/effect state did not match its journal.');
      return replay;
    }

    function read() {
      if (arguments.length !== 0) reject('READ_ONLY_SNAPSHOT', 'Snapshots are inspection/export only; this API never adopts supplied state.');
      const view = verified();
      return detach({
        schema: rules.sessionSchema, sessionId: settings.sessionId, revision: view.revision,
        active: view.active, archives: view.archives, counts: view.counts,
        history: records.map((record) => ({
          ordinal: record.result.revision,
          request: record.captured.invalid ? { invalidInput: record.captured.invalid } : record.captured.input,
          result: record.result
        })),
        terminalRejection
      });
    }

    function dispatch(input) {
      const before = verified();
      if (records.length >= rules.maximumOperations) {
        if (!terminalRejection) terminalRejection = freeze({
          operation: 'none', outcome: 'rejected', code: 'HISTORY_LIMIT', revision: before.revision,
          message: '64 retained operations reached; this terminal refusal cannot erase history or add admissions/effects.',
          eligibility: null
        });
        return detach(terminalRejection);
      }
      let captured;
      try {
        if (arguments.length !== 1) reject('INVALID_COMMAND', 'Only one closed command is accepted.');
        captured = freeze({ input: data(input, 'INVALID_COMMAND') });
      } catch (error) {
        captured = freeze({ invalid: { code: error.code || 'INVALID_COMMAND', message: error.message } });
      }
      const next = perform(before, captured);
      records = [...records, freeze({ captured, result: next.result })];
      projection = next.projection;
      verified();
      return detach(next.result);
    }

    return Object.freeze({ read, dispatch });
  }

  return Object.freeze({
    rules, parseCandidate, assessCandidate, createSession, oldConsumer: compatibility && compatibility.oldConsumer
  });
}));
