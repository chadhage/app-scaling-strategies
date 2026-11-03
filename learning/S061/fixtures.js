(function (root, factory) {
  'use strict';
  const fixtures = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixtures;
  else root.S061Fixtures = fixtures;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return freeze({
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    maxAttempts: 6,
    previousVersion: 10,
    committedVersion: 11,
    recordId: 'SYN-RECORD-061',
    defaults: {
      addedReader: 'behind', routing: 'unchecked', freshness: 'one-version', coverage: 'complete',
    },
    choices: {
      addedReader: ['behind', 'current', 'unknown'],
      routing: ['unchecked', 'primary-for-session', 'verified-or-primary'],
      freshness: ['one-version', 'current-only'],
      coverage: ['complete', 'partial', 'none'],
    },
    plan: [
      { id: 'browse-existing', kind: 'browse', candidate: 'reader-1' },
      { id: 'own-write-existing', kind: 'own-write', candidate: 'reader-1' },
      { id: 'browse-added', kind: 'browse', candidate: 'reader-2' },
      { id: 'own-write-added', kind: 'own-write', candidate: 'reader-2' },
    ],
  });
}));
