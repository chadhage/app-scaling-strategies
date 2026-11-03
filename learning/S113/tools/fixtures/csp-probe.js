'use strict';

(async () => {
  globalThis.__s113CspViolations = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    globalThis.__s113CspViolations.push({ directive: event.effectiveDirective,
      blockedURI: event.blockedURI, disposition: event.disposition });
  });
  const result = { probeContext: 'normal document external script', inlineExecuted: false,
    evalExecuted: false, evalError: null, fetchResolved: false, fetchError: null };
  globalThis.__s113CspProbeResult = result;
  const script = document.createElement('script');
  script.textContent = 'globalThis.__s113InlineProbe = "executed";';
  document.head.append(script);
  result.inlineExecuted = globalThis.__s113InlineProbe === 'executed';
  try { (0, eval)('globalThis.__s113EvalProbe = "executed";'); } catch (error) { result.evalError = error.name; }
  result.evalExecuted = globalThis.__s113EvalProbe === 'executed';
  try { await fetch('https://example.invalid/s113-csp-probe'); result.fetchResolved = true; } catch (error) { result.fetchError = error.name; }
  result.complete = true;
})();
