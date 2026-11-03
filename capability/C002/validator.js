(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./run-envelope-contract.js'), require('../C001/contract-guard.js'));
  } else {
    Object.defineProperty(root, 'C002Validator', {
      value: factory(root.C002RunEnvelopeContract, root.C001ContractGuard)
    });
  }
}(globalThis, function (contract, guard) {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function fieldPath(parent, key) {
    return parent === '$' ? key : `${parent}.${key}`;
  }

  function add(errors, path, code, message) {
    errors.push({ path, code, message });
  }

  function check(schema, value, path, errors) {
    if (schema.type === 'object') {
      let descriptors;
      try {
        if (value === null || typeof value !== 'object' || Array.isArray(value) ||
            ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
          throw new TypeError('Not a plain record.');
        }
        descriptors = Object.getOwnPropertyDescriptors(value);
      } catch {
        add(errors, path, 'INVALID_SHAPE', 'Expected a readable plain JSON object, not null, an array, or a class instance.');
        return undefined;
      }

      const output = {};
      for (const key of schema.required) {
        if (!Object.hasOwn(descriptors, key)) {
          add(errors, fieldPath(path, key), 'REQUIRED_FIELD', 'Required field is missing; no default is supplied.');
        }
      }
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string') {
          add(errors, path, 'NON_JSON_PROPERTY', 'Symbol properties are not JSON fields.');
          continue;
        }
        const nextPath = fieldPath(path, key);
        const descriptor = descriptors[key];
        if (!Object.hasOwn(schema.properties, key)) {
          add(errors, nextPath, 'UNKNOWN_FIELD', 'Unknown field; this closed contract does not accept overrides or additional fields.');
        }
        if (!Object.hasOwn(descriptor, 'value')) {
          add(errors, nextPath, 'DATA_PROPERTY_REQUIRED', 'Accessors are forbidden; validation does not execute getters or setters.');
          continue;
        }
        if (!descriptor.enumerable) {
          add(errors, nextPath, 'NON_JSON_PROPERTY', 'Fields must be enumerable JSON data properties.');
          continue;
        }
        if (Object.hasOwn(schema.properties, key)) {
          output[key] = check(schema.properties[key], descriptor.value, nextPath, errors);
        }
      }
      return output;
    }

    if (schema.type === 'integer') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0)) {
        add(errors, path, 'UNSAFE_NUMBER',
          'Expected a finite safe-integer JSON number; no strings, booleans, null, fractions, BigInt, boxed numbers, or negative zero.');
        return undefined;
      }
      if (value < schema.minimum || value > schema.maximum) {
        add(errors, path, 'INVALID_BOUND',
          `Bound must be within [${schema.minimum}, ${schema.maximum}]; no default or coercion is applied.`);
        return value;
      }
    } else if (schema.type === 'string') {
      if (typeof value !== 'string' ||
          (schema.minLength !== undefined && value.length < schema.minLength) ||
          (schema.maxLength !== undefined && value.length > schema.maxLength) ||
          (schema.pattern && !new RegExp(schema.pattern).test(value))) {
        add(errors, path, 'INVALID_STRING', 'Expected a nonblank JSON string satisfying the visible schema.');
        return undefined;
      }
    }

    if (Object.hasOwn(schema, 'const') && value !== schema.const) {
      const scope = path.startsWith('envelope.scope.') || path.startsWith('limits.budget.cloudSpend.');
      add(errors, path, scope ? 'SCOPE_ESCALATION' : 'CONSTANT_MISMATCH',
        `Required value is ${JSON.stringify(schema.const)}. Supplied comparison data cannot expand the local contract.`);
    }
    return value;
  }

  function at(value, path) {
    return path.split('.').reduce((record, key) => record[key], value);
  }

  function compare(request, authority, errors) {
    for (const metric of contract.metrics) {
      const value = at(request.envelope, metric);
      const bounds = at(request.limits, metric);
      if (bounds.min > bounds.max) {
        add(errors, `limits.${metric}.min`, 'INVALID_RANGE',
          `Minimum ${bounds.min} exceeds maximum ${bounds.max}; every inclusive range must be ordered.`);
        continue;
      }
      if (value < bounds.min || value > bounds.max) {
        add(errors, `envelope.${metric}`, 'OUT_OF_RANGE',
          `Value ${value} is outside supplied inclusive bounds [${bounds.min}, ${bounds.max}] (${request.limits.label}).`);
      }
    }
    if (authority && request.envelope.scope.liveAzureRuns > authority.nativeExecutionLimit) {
      add(errors, 'envelope.scope.liveAzureRuns', 'SCOPE_ESCALATION',
        `C001 forbids live Azure runs; the approved limit is ${authority.nativeExecutionLimit}.`);
    }
    if (authority && request.envelope.budget.cloudSpend > authority.authorizedCloudSpend) {
      add(errors, 'envelope.budget.cloudSpend', 'SCOPE_ESCALATION',
        `C001 forbids cloud expenditure; authorized cloud spend is ${authority.authorizedCloudSpend}, not an approved free resource.`);
    }
  }

  async function validateRunEnvelope(request, approval) {
    const errors = [];
    let checked;
    if (!contract || !contract.schema || !Array.isArray(contract.metrics)) {
      add(errors, '$', 'SCHEMA_UNAVAILABLE', 'The explicit local schema is unavailable; validation is denied.');
    } else {
      checked = check(contract.schema, request, '$', errors);
    }
    const shapeValid = errors.length === 0;
    let authority = null;
    if (!guard || typeof guard.guardOperation !== 'function') {
      add(errors, 'approval', 'AUTHORITY_UNAVAILABLE', 'C001 contract guard is unavailable; validation is denied.');
    } else {
      try {
        const decision = await guard.guardOperation(checked?.envelope?.action, approval);
        authority = { ...decision, snapshotSha256: guard.snapshotSha256 };
        for (const reason of decision.reasons) {
          const approvalReason = /^(APPROVAL_|CHOICE_|SNAPSHOT_|INTEGRITY_)/.test(reason.code);
          const path = approvalReason ? (reason.path ? `approval.${reason.path}` : 'approval') : 'envelope.action';
          add(errors, path, reason.code, reason.message);
        }
        if (!decision.allowed && decision.reasons.length === 0) {
          add(errors, 'approval', 'AUTHORITY_DENIED', 'C001 did not allow this local probe.');
        }
      } catch {
        add(errors, 'approval', 'AUTHORITY_UNAVAILABLE', 'C001 authority could not be established; validation is denied.');
      }
    }
    if (shapeValid) compare(checked, authority, errors);
    const valid = errors.length === 0 && authority !== null && authority.allowed === true;
    return freeze({
      valid,
      outcome: valid ? 'valid-local-envelope' : 'rejected',
      executed: false,
      authority,
      errors,
      validatedEnvelope: valid ? checked.envelope : null,
      appliedLimits: valid ? checked.limits : null
    });
  }

  return Object.freeze({ validateRunEnvelope });
}));
