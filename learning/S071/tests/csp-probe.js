(function () {
  'use strict';
  let outcome = 'allowed';
  try { new Function('return 71')(); } catch { outcome = 'blocked'; }
  globalThis.__S071_DYNAMIC_EVALUATION = outcome;
}());
