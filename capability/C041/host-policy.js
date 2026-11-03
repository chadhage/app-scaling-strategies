(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./accepted-catalog.js'));
  else Object.defineProperty(root, 'C041HostPolicy', { value: factory(root.C041AcceptedCatalog) });
}(globalThis, function (catalog) {
  'use strict';

  const refusal = Object.freeze({ accepted: false, reason: 'unapproved-lesson' });

  function resolveLesson(id) {
    const lesson = typeof id === 'string' && catalog.lessons.find(entry => entry.id === id);
    if (!lesson) return refusal;
    return Object.freeze({
      accepted: true, id: lesson.id, title: lesson.title, entry: lesson.entry
    });
  }

  return Object.freeze({
    listLessons: () => catalog.lessons,
    resolveLesson
  });
}));
