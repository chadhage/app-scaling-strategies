(function () {
  'use strict';
  const record = { evalBlocked: false, errorName: null };
  try {
    new Function('window.__cspEvalRan = true')();
  } catch (error) {
    record.evalBlocked = error.name === 'EvalError';
    record.errorName = error.name;
  }
  window.__pageWorldEvalProbe = record;
}());
