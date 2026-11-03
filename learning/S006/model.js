(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PreviewModel = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const routes = Object.freeze([
    { id: 'ordinary', label: 'Ordinary production navigation', path: '/profile', callback: false },
    { id: 'join-preview', label: 'Join authorized preview', path: '/join-preview', callback: true },
    { id: 'direct-ui', label: 'Direct candidate UI', path: '/candidate-7f3b/profile', callback: false },
    { id: 'direct-api', label: 'Direct candidate API', path: '/candidate-7f3b/api/getProfile', callback: false },
    { id: 'indirect-navigation', label: 'Indirect navigation link', path: '/profile?target=preview', callback: false },
    { id: 'indirect-callback', label: 'Indirect login/callback return', path: '/auth/callback?returnTo=/candidate-7f3b/profile', callback: true },
    { id: 'indirect-gateway', label: 'Indirect API/gateway selection', path: '/api/profile?version=v2', callback: false },
    { id: 'stable-preview', label: 'Stable endpoint, explicit preview selection', path: '/api/getProfile?audience=preview', callback: false },
    { id: 'direct-revision', label: 'Direct candidate revision', path: '/revisions/profile-v2-r002/api/getProfile', callback: false },
    { id: 'label-preview', label: 'Candidate preview label', path: '/labels/preview/api/getProfile', callback: false }
  ].map(Object.freeze));
  const identities = Object.freeze([
    { id: 'approved', label: 'Approved preview identity', subject: 'synthetic-preview-001', evidence: 'approved' },
    { id: 'visitor', label: 'Authenticated visitor, NOT preview-approved', subject: 'synthetic-visitor-002', evidence: 'not-approved' },
    { id: 'missing', label: 'Missing identity evidence', subject: null, evidence: 'missing' },
    { id: 'unrecognized', label: 'Unrecognized identity evidence', subject: null, evidence: 'unknown' }
  ].map(Object.freeze));
  const gaBaseline = Object.freeze({
    sessionId: 'ga-session-001', subject: 'synthetic-ga-001',
    attribution: 'GA:synthetic-ga-001', version: 'v1'
  });
  const callbackValues = ['bound', 'missing', 'mismatch', 'external-return'];
  const policies = ['enforced', 'obscurity-only'];

  function runProbe(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const input = {
      identity: typeof raw.identity === 'string' ? raw.identity : 'missing',
      route: typeof raw.route === 'string' ? raw.route : '',
      policy: typeof raw.policy === 'string' ? raw.policy : '',
      callback: typeof raw.callback === 'string' ? raw.callback : ''
    };
    const route = routes.find((item) => item.id === input.route);
    const identity = identities.find((item) => item.id === input.identity)
      || { subject: null, evidence: 'unknown', label: 'Unrecognized identity evidence' };
    const preview = {
      sessionId: 'preview-session-001',
      subject: identity.subject,
      attribution: `PREVIEW:${identity.subject || 'anonymous'}`,
      version: 'v1'
    };
    const probe = {
      input, mode: 'synthetic', nativeProof: false, automaticCandidatePercent: 0,
      decision: null, statusCode: null, candidateReached: false, version: null,
      authorizationEvidence: identity.evidence,
      ga: { before: { ...gaBaseline }, after: { ...gaBaseline } },
      preview: { before: { ...preview }, after: { ...preview, version: null } },
      navigation: {
        loginPath: null, callbackPath: null, returnPath: null,
        callbackBinding: 'not-used', status: 'not-used'
      },
      trace: [],
      cleanup: {
        status: 'not-required', resourcesCreated: 0, persistentStateCreated: false,
        scope: 'In-tab memory only; Reset clears displayed results and history.'
      }
    };
    function emit(stage, client, detail, version = null) {
      probe.trace.push({ sequence: probe.trace.length + 1, stage, client, detail, version });
    }
    function decide(decision, statusCode, version) {
      probe.decision = decision;
      probe.statusCode = statusCode;
      probe.version = version;
      probe.candidateReached = version === 'v2';
      probe.preview.after.version = version;
    }
    emit('ga.baseline', 'GA', 'Separate GA session and attribution are fixed on v1.', 'v1');
    emit('preview.request', 'preview', route ? `Inert route: ${route.path}` : 'Unrecognized route; no handler selected.');
    emit('identity.evidence', 'preview', `Synthetic evidence: ${identity.evidence}; subject: ${identity.subject || 'unknown'}.`);

    const invalid = !route || !policies.includes(input.policy)
      || (route.callback && !callbackValues.includes(input.callback));
    if (invalid) {
      decide('configuration-rejected', 400, null);
      emit('configuration.reject', 'preview', 'Unknown route, policy, or required callback evidence: fail closed.');
    } else if (route.id === 'ordinary') {
      decide('ga', 200, 'v1');
      emit('navigation.ga', 'preview', 'Ordinary navigation stays v1; production sign-in rules are not replaced.', 'v1');
    } else {
      let callbackAccepted = true;
      if (route.callback) {
        probe.navigation = {
          loginPath: '/auth/login', callbackPath: '/auth/callback',
          returnPath: input.callback === 'external-return' ? '[unapproved external return]' : '/candidate-7f3b/profile',
          callbackBinding: input.callback,
          status: input.callback === 'bound' ? 'preserved' : 'rejected'
        };
        emit('login.request', 'preview', 'Modeled login uses /auth/login and the same preview session; no real redirect.');
        callbackAccepted = input.callback === 'bound';
        emit('callback.validate', 'preview', callbackAccepted
          ? 'Modeled /auth/callback binds the same subject/session and an allowed local return path.'
          : `Callback evidence ${input.callback} rejected; no candidate admission.`);
      }
      if (!callbackAccepted) {
        decide('callback-rejected', 400, null);
        emit('preview.block', 'preview', 'Rejected callback is not a new preview identity or a successful visit.');
      } else {
        // This deliberately broken branch is the exercise's counterexample, not an access-control recommendation.
        const allowed = input.policy === 'obscurity-only' || identity.evidence === 'approved';
        emit('preview.authorize', 'preview', input.policy === 'enforced'
          ? `Per-request identity gate: ${identity.evidence}; URL knowledge and 0% routing grant nothing.`
          : 'UNSAFE: obscure URL knowledge replaces identity approval, despite 0% automatic candidate routing.');
        if (allowed) {
          decide('allowed', 200, 'v2');
          emit('preview.serve', 'preview', 'Synthetic candidate handler reached; verifier independently checks eligibility.', 'v2');
        } else {
          const knownVisitor = identity.evidence === 'not-approved';
          decide(knownVisitor ? 'forbidden' : 'unknown', knownVisitor ? 403 : 401, null);
          emit('preview.block', 'preview', knownVisitor
            ? 'Known visitor lacks preview approval: forbidden.'
            : 'Missing or unknown approval evidence: fail closed; identity remains unknown.');
        }
      }
    }
    emit('ga.after', 'GA', 'Independent GA client still has its original subject/session/attribution.', 'v1');
    emit('cleanup.scope', 'local', 'No resources, cookies, tokens, or persistent application state created.');
    return probe;
  }

  return Object.freeze({ routes, identities, runProbe });
}));
