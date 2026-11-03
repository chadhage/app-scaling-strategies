(function () {
  'use strict';
  let evalDenied = false;
  let evalError = null;
  try {
    globalThis.eval('globalThis.__s104EvalExecuted = true;');
  } catch (error) {
    evalDenied = true;
    evalError = { name: error.name, message: error.message };
  }
  globalThis.__s104CspProbe = {
    completed: true, evalDenied, evalError, evalExecuted: globalThis.__s104EvalExecuted
  };
}());
