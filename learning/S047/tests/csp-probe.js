(function () {
  'use strict';
  const result = globalThis.__s047CspTest;
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s047CspTest.inlineRan = true;';
  document.body.append(inline);
  inline.remove();
  try { new Function('return 47')(); } catch (error) {
    result.evalBlocked = error.name === 'EvalError';
    result.evalError = error.name;
  }
  fetch('data:application/json,%7B%7D')
    .catch(() => { result.connectBlocked = true; })
    .finally(() => { result.complete = true; });
}());
