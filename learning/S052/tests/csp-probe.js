(function () {
  'use strict';
  const button = document.createElement('button');
  button.id = 's052-dynamic-probe';
  button.type = 'button';
  button.textContent = 'Test-only dynamic-code CSP probe';
  button.addEventListener('click', function () {
    try {
      new Function('globalThis.__s052DynamicRan = true')();
    } catch (error) {
      globalThis.__s052DynamicBlocked = error.name === 'EvalError';
    } finally {
      globalThis.__s052DynamicProbeDone = true;
    }
  });
  document.body.append(button);
}());
