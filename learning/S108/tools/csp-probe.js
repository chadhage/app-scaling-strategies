(function () {
  'use strict';
  let blocked = false;
  try {
    eval('globalThis.__s108EvalExecuted = true');
  } catch {
    blocked = true;
  }
  globalThis.__s108NativeEvalProbe = {
    executed: globalThis.__s108EvalExecuted === true, blocked,
  };
}());
