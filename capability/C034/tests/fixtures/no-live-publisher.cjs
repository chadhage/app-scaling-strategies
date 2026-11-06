'use strict';

// Preload (node --require) that makes any access to the live private publisher fail the process.
// It proves a check is hermetic: the check may only use archived snapshots of publish.ps1.
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const livePublisher = /[\\/]\.git[\\/]kanban-orchestrator[\\/]publish\.ps1$/i;
const touchesLivePublisher = (target) => {
  if (typeof target === 'number') return false;
  try {
    const text = target instanceof URL ? fileURLToPath(target) : Buffer.isBuffer(target) ? target.toString('utf8') : String(target);
    return livePublisher.test(path.resolve(text));
  } catch {
    return false;
  }
};
const refusal = (name) => Object.assign(new Error(`LIVE_PUBLISHER_ACCESS: fs.${name} touched .git\\kanban-orchestrator\\publish.ps1`), { code: 'LIVE_PUBLISHER_ACCESS' });

for (const name of ['readFileSync', 'openSync', 'statSync', 'lstatSync', 'existsSync', 'accessSync', 'readFile', 'open', 'stat', 'lstat', 'access', 'createReadStream']) {
  const original = fs[name];
  fs[name] = function guarded(target, ...rest) {
    if (touchesLivePublisher(target)) throw refusal(name);
    return Reflect.apply(original, this, [target, ...rest]);
  };
}
for (const name of ['readFile', 'open', 'stat', 'lstat', 'access']) {
  const original = fs.promises[name];
  fs.promises[name] = function guarded(target, ...rest) {
    if (touchesLivePublisher(target)) return Promise.reject(refusal(`promises.${name}`));
    return Reflect.apply(original, this, [target, ...rest]);
  };
}
