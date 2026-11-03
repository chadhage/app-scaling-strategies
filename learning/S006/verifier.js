(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PreviewVerifier = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const candidateRoutes = [
    'join-preview', 'direct-ui', 'direct-api', 'indirect-navigation',
    'indirect-callback', 'indirect-gateway'
  ];
  const callbacks = ['bound', 'missing', 'mismatch', 'external-return'];
  const ga = {
    sessionId: 'ga-session-001', subject: 'synthetic-ga-001',
    attribution: 'GA:synthetic-ga-001', version: 'v1'
  };
  function same(actual, expected) {
    if (actual === expected) return true;
    if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
    const keys = Object.keys(expected);
    return Object.keys(actual).length === keys.length
      && keys.every((key) => Object.hasOwn(actual, key) && same(actual[key], expected[key]));
  }

  // The oracle uses the contract, not the producer's decision or authorizationEvidence success labels.
  function expectedFor(input) {
    const needsCallback = input.route === 'join-preview' || input.route === 'indirect-callback';
    const valid = (input.route === 'ordinary' || candidateRoutes.includes(input.route))
      && ['enforced', 'obscurity-only'].includes(input.policy)
      && (!needsCallback || callbacks.includes(input.callback));
    let decision;
    if (!valid) decision = 'configuration-rejected';
    else if (input.route === 'ordinary') decision = 'ga';
    else if (needsCallback && input.callback !== 'bound') decision = 'callback-rejected';
    else if (input.identity === 'approved') decision = 'allowed';
    else if (input.identity === 'visitor') decision = 'forbidden';
    else decision = 'unknown';
    const version = decision === 'allowed' ? 'v2' : decision === 'ga' ? 'v1' : null;
    const statusCode = {
      allowed: 200, ga: 200, forbidden: 403, unknown: 401,
      'callback-rejected': 400, 'configuration-rejected': 400
    }[decision];
    const navigation = valid && needsCallback ? {
      loginPath: '/auth/login', callbackPath: '/auth/callback',
      returnPath: input.callback === 'external-return' ? '[unapproved external return]' : '/candidate-7f3b/profile',
      callbackBinding: input.callback,
      status: input.callback === 'bound' ? 'preserved' : 'rejected'
    } : {
      loginPath: null, callbackPath: null, returnPath: null,
      callbackBinding: 'not-used', status: 'not-used'
    };
    const trace = ['ga.baseline', 'preview.request', 'identity.evidence'];
    if (!valid) trace.push('configuration.reject');
    else if (input.route === 'ordinary') trace.push('navigation.ga');
    else {
      if (needsCallback) trace.push('login.request', 'callback.validate');
      if (decision !== 'callback-rejected') trace.push('preview.authorize');
      trace.push(decision === 'allowed' ? 'preview.serve' : 'preview.block');
    }
    trace.push('ga.after', 'cleanup.scope');
    const subject = input.identity === 'approved' ? 'synthetic-preview-001'
      : input.identity === 'visitor' ? 'synthetic-visitor-002' : null;
    const previewBefore = {
      sessionId: 'preview-session-001', subject,
      attribution: `PREVIEW:${subject || 'anonymous'}`, version: 'v1'
    };
    return {
      decision, version, statusCode, navigation, trace,
      preview: { before: previewBefore, after: { ...previewBefore, version } }
    };
  }

  function verifyProbe(probe) {
    const value = probe && typeof probe === 'object' ? probe : {};
    const expected = expectedFor(value.input || {});
    const assertions = [];
    function check(id, label, actual, wanted) {
      assertions.push({ id, label, expected: wanted, actual, passed: same(actual, wanted) });
    }
    check('synthetic-scope', 'Only a synthetic run; 0% automatic routing is not authorization.', {
      mode: value.mode, nativeProof: value.nativeProof, automaticCandidatePercent: value.automaticCandidatePercent
    }, { mode: 'synthetic', nativeProof: false, automaticCandidatePercent: 0 });
    check('candidate-authorization', 'Only explicit approval may reach a candidate handler.', value.candidateReached, expected.decision === 'allowed');
    check('decision', 'Denied, unknown, and callback-rejected outcomes stay distinct.', value.decision, expected.decision);
    check('synthetic-status', 'Synthetic status matches the expected decision.', value.statusCode, expected.statusCode);
    check('served-version', 'Ordinary navigation stays v1; blocked probes serve no version.', value.version, expected.version);
    check('ga-attribution', 'GA identity, session, attribution, and version are unchanged.', value.ga, { before: ga, after: ga });
    check('preview-attribution', 'Preview subject and session survive any modeled login/callback.', value.preview, expected.preview);
    check('login-callback', 'Login path, callback binding, and allowed return semantics are preserved.', value.navigation, expected.navigation);
    const trace = Array.isArray(value.trace) ? value.trace : [];
    check('trace-order', 'Trace shows each required gate before any candidate service.', trace.map((event) => event.stage), expected.trace);
    check('trace-sequence', 'Trace sequence is contiguous.', trace.map((event) => event.sequence), expected.trace.map((_, index) => index + 1));
    check('cleanup-scope', 'No remote resources or persistent application state were created.', {
      status: value.cleanup && value.cleanup.status,
      resourcesCreated: value.cleanup && value.cleanup.resourcesCreated,
      persistentStateCreated: value.cleanup && value.cleanup.persistentStateCreated
    }, { status: 'not-required', resourcesCreated: 0, persistentStateCreated: false });
    return { passed: assertions.every((item) => item.passed), assertions };
  }

  function describeImpact(probe) {
    const expected = expectedFor(probe.input || {});
    const unauthorizedExposure = probe.candidateReached === true && expected.decision !== 'allowed';
    let preview;
    if (unauthorizedExposure) preview = 'unauthorized preview exposure';
    else if (probe.candidateReached) preview = 'preview admitted';
    else if (probe.decision === 'ga') preview = 'ordinary navigation on v1';
    else if (probe.decision === 'unknown') preview = 'preview unknown; access blocked';
    else if (probe.decision === 'callback-rejected') preview = 'preview blocked: callback rejected';
    else if (probe.decision === 'configuration-rejected') preview = 'preview blocked: unknown configuration';
    else preview = 'preview blocked';
    return {
      gaUnchanged: same(probe.ga, { before: ga, after: ga }),
      preview, unauthorizedExposure,
      scope: 'Synthetic impact only; not real-user continuity or production evidence.'
    };
  }

  return Object.freeze({ verifyProbe, describeImpact });
}));
