(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C041HostPolicy', { value: factory() });
}(globalThis, function () {
  'use strict';
  return Object.freeze({
    listLessons: () => Object.freeze([]),
    resolveLesson: () => Object.freeze({ accepted: false, reason: 'unapproved-lesson' })
  });
}));
