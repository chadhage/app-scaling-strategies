(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C059A11y', { value: factory() });
}(globalThis, function () {
  'use strict';

  // A NAIVE checker (the RED subject): it looks at nothing and finds nothing.
  return Object.freeze({
    check: () => ({ ok: true, findings: [] }),
    checkStyles: () => ({ ok: true, findings: [] }),
    tabOrder: () => [],
    walkTab: () => ({ trapped: false, visited: [], findings: [] }),
  });
}));
