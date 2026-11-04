'use strict';

module.exports = Object.freeze({
  ownedPrefix: 'capability/C035/',
  snapshot: () => Object.freeze({ schema: 'C035-foreign-index/1', paths: [], nameStatus: '', entries: '', flags: '', debug: '' }),
  compare: () => Object.freeze({ preserved: true, changed: [] }),
  verify: (before) => Object.freeze({ preserved: true, changed: [], before, after: before }),
  run: () => Object.freeze({ exitCode: 0, output: '{}' })
});
