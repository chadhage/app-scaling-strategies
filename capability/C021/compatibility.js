(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C020/contract.js'), require('../C020/inspector.js'));
  } else {
    Object.defineProperty(root, 'C021Compatibility', { value: factory(root.C020Contract, root.C020Inspector) });
  }
}(globalThis, function (contract, inspector) {
  'use strict';

  const newContract = 'getProfile/2';
  const adapterId = 'C021/getProfile-2-to-1/r1';
  const fixtureRevision = 'C021-breaking-r1';
  const mode = 'synthetic-local-contract-rehearsal';

  function reject(code, message) {
    const error = new Error(message);
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

  function snapshot(value) {
    let nodes = 0;
    function copy(input, ancestors, depth) {
      if (++nodes > 512 || depth > 12) reject('INVALID_DATA', 'Input exceeds the bounded JSON data shape.');
      if (input === null || typeof input === 'boolean') return input;
      if (typeof input === 'string' && input.length <= 16384) return input;
      if (typeof input === 'number' && Number.isFinite(input)) return input;
      if (!input || typeof input !== 'object' || ancestors.has(input)) {
        reject('INVALID_DATA', 'Only finite, acyclic JSON data is accepted.');
      }
      const prototype = Object.getPrototypeOf(input);
      const array = Array.isArray(input);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
        reject('INVALID_DATA', 'Custom or inherited prototypes are not JSON records.');
      }
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) {
        reject('INVALID_DATA', 'Accessors and symbol properties are not accepted.');
      }
      const length = array ? descriptors.length.value : 0;
      if (array && (length > 128 || keys.length !== length + 1
          || Array.from({ length }, (_, index) => String(index)).some((key) => !descriptors[key]?.enumerable))) {
        reject('INVALID_DATA', 'Collections must be bounded, dense JSON arrays without extra fields.');
      }
      const fields = array ? keys.filter((key) => key !== 'length') : keys;
      if (fields.length > 128 || fields.some((key) => !descriptors[key].enumerable)) {
        reject('INVALID_DATA', 'JSON fields must be enumerable own data fields.');
      }
      ancestors.add(input);
      const output = array ? [] : {};
      for (const key of fields) {
        Object.defineProperty(output, key, {
          value: copy(descriptors[key].value, ancestors, depth + 1),
          enumerable: true, writable: true, configurable: true
        });
      }
      ancestors.delete(input);
      return output;
    }
    return copy(value, new Set(), 0);
  }

  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }

  function exactKeys(value, keys, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
      reject(code, 'The explicit contract requires exactly its documented fields.');
    }
  }

  function context(implementation, profileId) {
    if (!contract || contract.apiContract !== 'getProfile/1' || !contract.stamps
        || !Array.isArray(contract.profiles) || !inspector || typeof inspector.inspect !== 'function'
        || typeof inspector.oldConsumer !== 'function') {
      reject('CONTRACT_UNAVAILABLE', 'The unchanged C020 contract and inspector are required.');
    }
    if (typeof implementation !== 'string' || !Object.hasOwn(contract.stamps, implementation)) {
      reject('UNKNOWN_IMPLEMENTATION', 'Supply an explicit C020 implementation: v1 or v2.');
    }
    if (typeof profileId !== 'string' || profileId.length !== 13 || !/^synthetic-[0-9]{3}$/.test(profileId)) {
      reject('INVALID_PROFILE_ID', 'Supply an explicit, unmodified synthetic-NNN identifier.');
    }
    const profile = contract.profiles.find((item) => item.id === profileId);
    if (!profile) reject('UNKNOWN_PROFILE', 'No immutable synthetic profile has that identifier.');
    return profile;
  }

  function personFrom(profile) {
    return {
      key: profile.id, name: profile.displayName,
      contact: { emailAddress: profile.email },
      settings: {
        language: profile.preferences.locale, colorScheme: profile.preferences.theme,
        interests: [...profile.preferences.topics]
      }
    };
  }

  function sourceProvenance(stamp) {
    return {
      fixtureRevision, mode, dataKind: 'synthetic', sourceApiContract: contract.apiContract,
      sourceStamp: { ...stamp }
    };
  }

  function makeBreaking(baseline, implementation, profileId) {
    context(implementation, profileId);
    const source = snapshot(baseline);
    inspector.inspect(source, implementation, profileId);
    return freeze({
      apiContract: newContract, person: personFrom(inspector.oldConsumer(source)),
      provenance: sourceProvenance(source.stamp)
    });
  }

  function readNew(candidate, implementation, profileId) {
    const expected = context(implementation, profileId);
    const value = snapshot(candidate);
    if (!value || value.apiContract !== newContract) {
      reject('CONTRACT_MISMATCH', 'This operation requires explicit synthetic getProfile/2, not an implementation version.');
    }
    exactKeys(value, ['apiContract', 'person', 'provenance'], 'INVALID_ENVELOPE');
    const person = value.person;
    exactKeys(person, ['key', 'name', 'contact', 'settings'], 'INVALID_PROFILE');
    exactKeys(person.contact, ['emailAddress'], 'INVALID_PROFILE');
    exactKeys(person.settings, ['language', 'colorScheme', 'interests'], 'INVALID_PROFILE');
    if (![person.key, person.name, person.contact.emailAddress, person.settings.language, person.settings.colorScheme]
      .every((field) => typeof field === 'string') || !Array.isArray(person.settings.interests)
      || !person.settings.interests.every((topic) => typeof topic === 'string')) {
      reject('INVALID_PROFILE', 'The renamed fields and ordered interests must retain their documented types.');
    }
    if (canonical(person) !== canonical(personFrom(expected))) {
      reject('PROFILE_MISMATCH', 'Candidate business data differs from the immutable expected synthetic profile.');
    }
    if (canonical(value.provenance) !== canonical(sourceProvenance(contract.stamps[implementation]))) {
      reject('PROVENANCE_MISMATCH', 'The synthetic revision, source contract, and exact C020 fixture stamp must match.');
    }
    return value;
  }

  function profileFrom(person) {
    return {
      id: person.key, displayName: person.name, email: person.contact.emailAddress,
      preferences: {
        locale: person.settings.language, theme: person.settings.colorScheme,
        topics: [...person.settings.interests]
      }
    };
  }

  function newConsumer(candidate, implementation, profileId) {
    return freeze(profileFrom(readNew(candidate, implementation, profileId).person));
  }

  function adaptToOld(candidate, implementation, profileId) {
    const value = readNew(candidate, implementation, profileId);
    // No C020 stamp at the top level: an adaptation is not an original C020 observation.
    return freeze({
      apiContract: contract.apiContract, profile: profileFrom(value.person),
      provenance: {
        adapterId, inputContract: newContract, outputContract: contract.apiContract,
        mode, dataKind: 'synthetic', sourceFixtureRevision: value.provenance.fixtureRevision,
        sourceApiContract: value.provenance.sourceApiContract,
        sourceStamp: { ...value.provenance.sourceStamp }
      }
    });
  }

  function rehearse(baseline, implementation, profileId) {
    context(implementation, profileId);
    const source = snapshot(baseline);
    inspector.inspect(source, implementation, profileId);
    const raw = makeBreaking(source, implementation, profileId);
    const adapted = adaptToOld(raw, implementation, profileId);
    const oldSemantics = inspector.oldConsumer(source);
    const newSemantics = newConsumer(raw, implementation, profileId);
    const adaptedSemantics = inspector.oldConsumer(adapted);
    function safe(transition, consume) {
      if (canonical(consume()) !== canonical(oldSemantics)) {
        reject('SEMANTIC_MISMATCH', 'A consumer changed a business field; no safe transition can be emitted.');
      }
      return { transition, outcome: 'SAFE', code: 'SEMANTICS_PRESERVED' };
    }
    function breaking(transition, consume) {
      try { consume(); } catch (error) {
        if (error.code !== 'CONTRACT_MISMATCH') throw error;
        return { transition, outcome: 'BREAKING', code: error.code };
      }
      reject('EXPECTED_REJECTION_MISSING', 'The incompatible contract was accepted unexpectedly.');
    }
    const outcomes = [
      safe('baseline -> old', () => inspector.oldConsumer(source)),
      breaking('raw -> old', () => inspector.oldConsumer(raw)),
      safe('raw -> new', () => newConsumer(raw, implementation, profileId)),
      safe('adapted -> old', () => inspector.oldConsumer(adapted)),
      breaking('baseline -> new', () => newConsumer(source, implementation, profileId)),
      breaking('adapted -> new', () => newConsumer(adapted, implementation, profileId))
    ];
    return freeze({
      mode, profileId, implementation, adapterId, baseline: source, raw, adapted,
      oldSemantics, newSemantics, adaptedSemantics, outcomes
    });
  }

  function parseCandidate(text, implementation, profileId) {
    if (typeof text !== 'string' || text.length === 0 || text.length > 16384) {
      reject('INVALID_JSON', 'Supply explicit JSON of at most 16384 characters.');
    }
    let value;
    try { value = JSON.parse(text); } catch { reject('INVALID_JSON', 'Candidate is not valid JSON.'); }
    return freeze(readNew(value, implementation, profileId));
  }

  return Object.freeze({
    newContract, adapterId,
    oldConsumer: inspector && inspector.oldConsumer,
    makeBreaking, newConsumer, adaptToOld, rehearse, parseCandidate
  });
}));
