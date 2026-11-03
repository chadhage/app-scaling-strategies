(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../C001/approved-contract.js'), require('../C001/contract-guard.js'),
      require('../C002/validator.js'), require('../C002/run-envelope-contract.js'),
      require('../C002/synthetic-fixture.js'), require('../C003/matrix-contract.js'),
      require('../C003/matrix-data.js'), require('./plan-provenance.js'), require('node:crypto').webcrypto
    );
  } else {
    Object.defineProperty(root, 'C004PlanModel', { value: factory(
      root.C001ApprovedContract, root.C001ContractGuard, root.C002Validator,
      root.C002RunEnvelopeContract, root.C002SyntheticFixture, root.C003Contract,
      root.C003Matrix, root.C004Provenance, root.crypto
    ) });
  }
}(globalThis, function (snapshot, guard, validator, envelopeContract, envelopeFixture, matrixContract, matrix, provenance, crypto) {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function issue(path, code, message) { return { path, code, message }; }
  function rejected(errors) {
    return freeze({ valid: false, outcome: 'invalid-plan', executed: false, errors, plan: null });
  }

  function readRecord(value, keys, path, errors) {
    let descriptors;
    try {
      if (value === null || typeof value !== 'object' || Array.isArray(value) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError();
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      errors.push(issue(path, 'INVALID_SHAPE', 'Expected a readable plain JSON record.'));
      return null;
    }
    const output = {};
    for (const key of keys) {
      if (!Object.hasOwn(descriptors, key)) {
        errors.push(issue(`${path}.${key}`, 'REQUIRED_FIELD', 'Required field is missing; no default is supplied.'));
      }
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') {
        errors.push(issue(path, 'NON_JSON_PROPERTY', 'Symbol properties are not JSON fields.'));
        continue;
      }
      const descriptor = descriptors[key];
      if (!keys.includes(key)) errors.push(issue(`${path}.${key}`, 'UNKNOWN_FIELD', 'Unknown plan field; no override is accepted.'));
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        errors.push(issue(`${path}.${key}`, 'DATA_PROPERTY_REQUIRED', 'Only enumerable JSON data properties are accepted; accessors are not executed.'));
      } else if (keys.includes(key)) {
        output[key] = descriptor.value;
      }
    }
    return output;
  }

  function text(value, path, errors, maximum = 1200) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
      errors.push(issue(path, 'INVALID_TEXT', `Explicit nonblank text of at most ${maximum} characters is required.`));
    }
  }

  function nonnegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
  }

  function checkRequest(request) {
    const errors = [];
    const input = readRecord(request, [
      'schemaVersion', 'mode', 'configurationId', 'envelopeRequest', 'durationBasis', 'resources', 'pricing'
    ], '$', errors);
    if (!input) return { input: null, errors };
    if (input.schemaVersion !== 1) errors.push(issue('schemaVersion', 'VERSION_MISMATCH', 'The explicit plan schemaVersion must be 1.'));
    if (!['local-resource-free', 'native-proposal'].includes(input.mode)) {
      errors.push(issue('mode', 'INVALID_MODE', 'Choose local-resource-free or native-proposal; neither starts a run.'));
    }
    text(input.durationBasis, 'durationBasis', errors);
    if (input.mode === 'local-resource-free') {
      if (input.configurationId !== null) {
        errors.push(issue('configurationId', 'LOCAL_CONFIGURATION_FORBIDDEN', 'A resource-free local plan must explicitly have no native configuration (null).'));
      }
    } else {
      text(input.configurationId, 'configurationId', errors, 80);
    }
    const resources = readRecord(input.resources, ['cloudResourceCount', 'description'], 'resources', errors);
    if (resources) {
      text(resources.description, 'resources.description', errors);
      if (resources.cloudResourceCount !== null && !nonnegativeInteger(resources.cloudResourceCount)) {
        errors.push(issue('resources.cloudResourceCount', 'INVALID_RESOURCE_COUNT', 'Supply a nonnegative safe integer or explicit null for an unknown count.'));
      }
      if (input.mode === 'local-resource-free' && resources.cloudResourceCount !== 0) {
        errors.push(issue('resources.cloudResourceCount', 'LOCAL_RESOURCES_FORBIDDEN', 'Local resource-free review requires exactly 0 cloud resources.'));
      }
      if (input.mode === 'native-proposal' && resources.cloudResourceCount === 0) {
        errors.push(issue('resources.cloudResourceCount', 'NATIVE_RESOURCES_UNKNOWN', 'A native proposal cannot claim zero cloud resources; use a positive assumption or null for unknown.'));
      }
    }
    const pricing = readRecord(input.pricing, ['status', 'currency', 'totalMinorUnits', 'basis', 'source'], 'pricing', errors);
    if (pricing) {
      text(pricing.basis, 'pricing.basis', errors);
      if (!['not-applicable', 'missing', 'unknown', 'unverified-estimate'].includes(pricing.status)) {
        errors.push(issue('pricing.status', 'INVALID_PRICING_STATUS', 'Use not-applicable, missing, unknown, or unverified-estimate.'));
      }
      if (pricing.status === 'unverified-estimate') {
        if (typeof pricing.currency !== 'string' || !/^[A-Z]{3}$/.test(pricing.currency)) {
          errors.push(issue('pricing.currency', 'CURRENCY_REQUIRED', 'An explicit three-letter uppercase currency label is required; no conversion or currency precision is inferred.'));
        }
        if (!nonnegativeInteger(pricing.totalMinorUnits) || pricing.totalMinorUnits === 0) {
          errors.push(issue('pricing.totalMinorUnits', 'POSITIVE_ESTIMATE_REQUIRED', 'Supply a positive safe-integer total in the declared currency minor units. Zero is not evidence of free Azure execution.'));
        }
        const source = readRecord(pricing.source, ['reference', 'capturedAtUtc', 'configurationId'], 'pricing.source', errors);
        if (source) {
          text(source.reference, 'pricing.source.reference', errors, 300);
          const date = source.capturedAtUtc;
          if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) ||
              !Number.isFinite(Date.parse(date)) ||
              new Date(date).toISOString().slice(0, 19) !== date.slice(0, 19)) {
            errors.push(issue('pricing.source.capturedAtUtc', 'INVALID_PRICE_TIMESTAMP', 'An exact, real UTC capture timestamp is required; freshness is not verified.'));
          }
          if (source.configurationId !== input.configurationId) {
            errors.push(issue('pricing.source.configurationId', 'PRICE_TARGET_MISMATCH', 'The declared estimate source must reference this exact configuration.'));
          }
          pricing.source = source;
        }
      } else {
        for (const key of ['currency', 'totalMinorUnits', 'source']) {
          if (pricing[key] !== null) {
            errors.push(issue(`pricing.${key}`, 'UNPRICED_VALUE_FORBIDDEN', 'Not-applicable, missing and unknown pricing require explicit null, not zero or an invented quote.'));
          }
        }
      }
      if (input.mode === 'native-proposal' && pricing.status === 'not-applicable') {
        errors.push(issue('pricing.status', 'NATIVE_PRICING_REQUIRED', 'Native pricing cannot be not-applicable; declare missing/unknown pricing or an explicitly unverified estimate.'));
      }
      if (input.mode === 'local-resource-free' && pricing.status === 'unverified-estimate') {
        errors.push(issue('pricing.status', 'LOCAL_NOT_A_CLOUD_ESTIMATE', 'A local resource-free review cannot invent a cloud estimate.'));
      }
    }
    return { input: { ...input, resources, pricing }, errors };
  }

  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }

  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function checkDependencies() {
    const errors = [];
    if (!snapshot || !guard || typeof guard.guardOperation !== 'function' ||
        !validator || typeof validator.validateRunEnvelope !== 'function' ||
        !matrixContract || typeof matrixContract.validateMatrix !== 'function' ||
        typeof matrixContract.filterRows !== 'function' || !provenance ||
        !envelopeContract || !envelopeFixture || !matrix) {
      return [issue('dependencies', 'DEPENDENCY_UNAVAILABLE', 'The unchanged C001/C002/C003 imports and pinned C004 provenance are required; review is denied.')];
    }
    if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') {
      return [issue('integrity', 'INTEGRITY_UNAVAILABLE', 'SHA-256 integrity checking is unavailable; review is denied.')];
    }
    const dataPins = [
      ['C002.contract', envelopeContract, provenance.C002.contractDataSha256],
      ['C002.fixture', envelopeFixture, provenance.C002.fixtureDataSha256],
      ['C003.matrix', matrix, provenance.C003.matrixDataSha256]
    ];
    for (const [name, value, expected] of dataPins) {
      if (await sha256(JSON.stringify(value)) !== expected) {
        errors.push(issue(name, 'DEPENDENCY_DRIFT', 'Imported data differs from the accepted dependency pinned by C004; review is denied.'));
      }
    }
    if (guard.snapshotSha256 !== provenance.C001.snapshotSha256) {
      errors.push(issue('C001', 'AUTHORITY_PIN_MISMATCH', 'The C001 guard pin differs from the accepted authority.'));
    }
    const checkedMatrix = matrixContract.validateMatrix(matrix);
    if (!checkedMatrix.valid) {
      checkedMatrix.errors.forEach(message => errors.push(issue('C003.matrix', 'MATRIX_INVALID', message)));
    }
    return errors;
  }

  async function buildPlan(request, approval) {
    try {
      const { input, errors } = checkRequest(request);
      if (errors.length) return rejected(errors);
      errors.push(...await checkDependencies());
      if (errors.length) return rejected(errors);
      const compared = await validator.validateRunEnvelope(input.envelopeRequest, approval);
      if (!compared.valid) {
        return rejected(compared.errors.map(error => ({
          ...error, path: error.path.startsWith('approval') ? error.path : `envelopeRequest.${error.path}`
        })));
      }
      const native = input.mode === 'native-proposal';
      const configuration = native ? matrixContract.filterRows(matrix).find(row => row.id === input.configurationId) : null;
      if (native && !configuration) {
        return rejected([issue('configurationId', 'CONFIGURATION_NOT_FOUND', 'The configuration is not in the pinned C003 matrix; no target or support is inferred.')]);
      }
      const blockers = [];
      if (['missing', 'unknown'].includes(input.pricing.status)) {
        blockers.push(issue('pricing.status', `PRICING_${input.pricing.status.toUpperCase()}`,
          `${input.pricing.status === 'missing' ? 'Missing' : 'Unknown'} pricing: no monetary estimate or approval. Null is not zero cost.`));
      }
      if (input.pricing.status === 'unverified-estimate') {
        blockers.push(issue('pricing', 'PRICING_UNVERIFIED', 'A user-supplied total and source are not a verified provider quote, spend reservation, or consent.'));
      }
      if (native) {
        const decision = await guard.guardOperation('native.execute', approval);
        blockers.push(...decision.reasons);
        if (decision.allowed) {
          return rejected([issue('C001', 'AUTHORITY_SCOPE_CHANGED', 'The pinned local-only authority no longer denies native execution; independent reapproval is required.')]);
        }
        blockers.push(issue('configurationId', 'NATIVE_UNQUALIFIED', 'Documented support is not native qualification or consent. No native configuration is qualified.'));
        if (configuration.status !== 'documented-supported') {
          blockers.push(issue('configurationId', `CONFIGURATION_${configuration.status.toUpperCase()}`, configuration.reason));
        }
      }
      const normalized = {
        schemaVersion: 1, mode: input.mode, configurationId: input.configurationId,
        envelopeRequest: { envelope: compared.validatedEnvelope, limits: compared.appliedLimits },
        durationBasis: input.durationBasis, resources: input.resources, pricing: input.pricing
      };
      const fingerprint = await sha256(canonical({
        request: normalized, approval: provenance.C001.snapshotSha256,
        envelopeContract: provenance.C002.contractDataSha256, matrix: provenance.C003.matrixDataSha256
      }));
      const plan = {
        schemaVersion: 1,
        scope: 'local-implementation-only',
        mode: input.mode,
        inputFingerprint: fingerprint,
        canAcknowledge: !native && blockers.length === 0,
        cloudExecutionAuthorized: false,
        executed: false,
        configuration,
        configurationSources: configuration ? matrix.sources.filter(source =>
          configuration.sourceIds.includes(source.id) || configuration.constraints.some(item => item.sourceIds.includes(source.id))) : [],
        cost: {
          ...input.pricing,
          notice: input.pricing.status === 'not-applicable'
            ? 'Not applicable — no cloud execution. No monetary Azure estimate is made; this is not a free Azure resource.'
            : input.pricing.status === 'unverified-estimate'
              ? 'Unverified user-supplied total in currency minor units, not a provider quote. Currency precision, freshness, coverage, taxes and billing duration are not verified; no spend is authorized.'
              : 'No monetary estimate: pricing is missing or unknown, not zero. No cost approval is possible.'
        },
        duration: {
          comparisonSeconds: compared.validatedEnvelope.durationSeconds,
          suppliedBounds: compared.appliedLimits.durationSeconds,
          basis: input.durationBasis,
          nativeElapsedSeconds: null,
          notice: 'Comparison seconds are not observed execution time or a native setup/run/overlap/cleanup/billing estimate.'
        },
        resources: { ...input.resources, inventoryVerified: false, reserved: false },
        load: compared.validatedEnvelope.load,
        capacity: compared.validatedEnvelope.capacity,
        comparisonLimits: compared.appliedLimits,
        permissions: {
          ...Object.fromEntries(matrixContract.FLAG_KEYS.map(key => [key, snapshot.approval[key]])),
          maximumLiveAzureRuns: compared.authority.nativeExecutionLimit,
          authorizedCloudSpend: compared.authority.authorizedCloudSpend
        },
        liveAzureRuns: compared.validatedEnvelope.scope.liveAzureRuns,
        productionRuntimeValidated: compared.authority.productionRuntimeValidated,
        blockers,
        provenance,
        matrixProvenance: matrix.provenance
      };
      return freeze({ valid: true, outcome: plan.canAcknowledge ? 'local-review-ready' : 'blocked-plan', executed: false, errors: [], plan });
    } catch {
      return rejected([issue('$', 'PLAN_REVIEW_UNAVAILABLE', 'Plan data or dependency integrity could not be read safely; no plan or acknowledgement is available.')]);
    }
  }

  function createReviewSession() {
    let revision = 0;
    let current = null;
    let consent = null;
    let pending = false;
    function invalidate() {
      revision++;
      current = null;
      consent = null;
      pending = false;
    }
    return Object.freeze({
      invalidate,
      async review(request, approval) {
        invalidate();
        const startedAtRevision = revision;
        pending = true;
        const result = await buildPlan(request, approval);
        if (revision !== startedAtRevision) {
          return rejected([issue('$', 'STALE_REVIEW', 'Inputs changed while review was pending; the old result was discarded.')]);
        }
        pending = false;
        current = result;
        return result;
      },
      acknowledge(confirmed) {
        consent = null;
        let reasons = [];
        if (confirmed !== true) {
          reasons = [issue('acknowledgement', 'CONFIRMATION_REQUIRED', 'Explicit true acknowledgement of local plan review only is required.')];
        } else if (pending || !current?.valid) {
          reasons = [issue('acknowledgement', 'REVIEW_REQUIRED', 'Review the current explicit inputs first; there is no usable current plan.')];
        } else if (!current.plan.canAcknowledge) {
          reasons = [issue('acknowledgement', 'PLAN_BLOCKED', 'This plan cannot be acknowledged.'), ...current.plan.blockers];
        } else {
          consent = freeze({
            scope: 'local-plan-review-only',
            inputFingerprint: current.plan.inputFingerprint,
            revision,
            acknowledgedAtUtc: new Date().toISOString(),
            cloudExecutionAuthorized: false,
            executed: false
          });
        }
        return freeze({ accepted: consent !== null, executed: false, reasons, consent });
      },
      snapshot() {
        return freeze({ revision, pending, review: current, consent });
      }
    });
  }

  return Object.freeze({ buildPlan, createReviewSession });
}));
