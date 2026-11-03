(function () {
  'use strict';
  const result = { blocked: false, error: null };
  try {
    eval('1 + 1');
  } catch (error) {
    result.blocked = error.name === 'EvalError';
    result.error = error.name;
  }
  globalThis.__s068EvalProbe = Object.freeze(result);
}());
