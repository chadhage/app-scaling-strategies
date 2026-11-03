(function () {
  'use strict';
  let outcome = 'allowed';
  try { new Function('return 67')(); } catch { outcome = 'blocked'; }
  globalThis.__S067_DYNAMIC_EVALUATION = outcome;
}());
