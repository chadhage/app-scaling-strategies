(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C041AcceptedCatalog', { value: factory() });
}(globalThis, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  return freeze({
    schemaVersion: 1,
    capturedAtUtc: '2026-11-03T14:07:58.5935944Z',
    source: {
      path: '.docs\\wiki\\flow-state.json',
      revision: 87,
      updatedAtUtc: '2026-11-03T14:05:26.2262292Z',
      sha256: '5c07122fe7a856dd082c25682de73d5f3980f6a1ecbec7d5c6db2e57991ebbfc',
      selector: 'cards[id in (A-S001,A-S003)]: state Done and accepted review'
    },
    gate: {
      id: 'C001',
      state: 'Done',
      frontend: 'Portable HTML/JavaScript lessons',
      liveAzureExecutionApproved: false,
      iacGenerationApproved: false,
      scaffoldApproved: false,
      deploymentApproved: false,
      identityRegistrationApproved: false,
      expenditureApproved: false
    },
    lessons: [
      {
        id: 'A-S001',
        title: 'Warm v2, then hand off',
        entry: '/c041-lessons/A-S001/index.html',
        acceptance: {
          state: 'Done',
          acceptedAtUtc: '2026-11-03T09:50:01.8972273Z',
          commit: '62c6395b009b1865c0dbd225b8573fa848215ee4',
          tag: 'kanban/A-S001/62c6395b009b',
          review: { accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true }
        },
        assets: [
          { file: 'index.html', path: 'learning\\S001\\index.html', sha256: 'f927b05397b20625bd2f65b79a0d6481455f252d7e9dd5d733294477d9e9846f' },
          { file: 'styles.css', path: 'learning\\S001\\styles.css', sha256: '7c9db6728f587d95043962ab4225ca7fca06fc7dc021af63667d5df9864fb910' },
          { file: 'engine.js', path: 'learning\\S001\\engine.js', sha256: '407347fa86ff763c6223928bc1fc5a21fe19bd862c2f713bc4206c2bf7c8ecce' },
          { file: 'app.js', path: 'learning\\S001\\app.js', sha256: 'c861a3abf680f74ea7e8f472646c0236324f36676eb7036eb3f9702138d2783f' }
        ]
      },
      {
        id: 'A-S003',
        title: 'Journey-gated canary rehearsal',
        entry: '/c041-lessons/A-S003/index.html',
        acceptance: {
          state: 'Done',
          acceptedAtUtc: '2026-11-03T09:50:02.0991652Z',
          commit: '84b320e41e07417b65bcd6d707db4e55ff84758c',
          tag: 'kanban/A-S003/84b320e41e07',
          review: { accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true }
        },
        assets: [
          { file: 'index.html', path: 'learning\\S003\\index.html', sha256: 'e86cdda08276308d574612ba4be0de5df943d7dafd5f1ff38db4857d16b1116a' },
          { file: 'lesson.css', path: 'learning\\S003\\lesson.css', sha256: '33b7eb2b82d3240d28bdf2811e5467b10e5d69e6f6f41f4efb0425e34b04b997' },
          { file: 'canary.js', path: 'learning\\S003\\canary.js', sha256: '2c2068a4f36b4e59ffb517b075aa49001454d92854bc14ab8f99116ab0a01a7c' },
          { file: 'lesson.js', path: 'learning\\S003\\lesson.js', sha256: 'daf3534b53d0e614fe8c033c85855cd94b377c0a2c9feeb174ad6e48979a57a8' }
        ]
      }
    ]
  });
}));
