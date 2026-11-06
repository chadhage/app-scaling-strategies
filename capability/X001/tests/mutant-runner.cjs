'use strict';

// Worker thread of tests\mutants.cjs: runs the suites of ONE mutant in a fresh module graph with a minimal node:test (test(name, fn) and t.diagnostic;
// the suites use nothing else) and answers { killed, suite, by }. The mutated source is served for the one production file through fs.readFileSync (the
// CommonJS loader and the DOM stub both read it that way); nothing is written to disk and the namespace is never touched.
const { parentPort, workerData } = require('node:worker_threads');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const { repository, file, mutated, suites } = workerData;
const target = path.join(repository, 'capability', 'X001', file || '');
const realRead = fs.readFileSync;
if (file) {
  fs.readFileSync = function read(name, ...rest) {
    if (typeof name === 'string' && path.resolve(name) === target) {
      const encoding = typeof rest[0] === 'string' ? rest[0] : rest[0] && rest[0].encoding;
      return encoding ? mutated : Buffer.from(mutated, 'utf8');
    }
    return realRead.call(this, name, ...rest);
  };
}

let registry = [];
const fakeTest = (name, options, body) => registry.push({ name, body: typeof options === 'function' ? options : body });
fakeTest.test = fakeTest;
const realLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  return request === 'node:test' || request === 'test' ? fakeTest : realLoad.call(this, request, parent, isMain);
};

async function main() {
  for (const suite of suites) {
    registry = [];
    require(path.join(repository, 'capability', 'X001', 'tests', suite));
    const failed = [];
    for (const { name, body } of registry) {
      try {
        await body({ name, diagnostic() {} });
      } catch {
        failed.push(name);
        break;
      }
    }
    if (failed.length > 0) return { killed: true, suite, by: failed.slice(0, 2), ran: registry.length };
  }
  return { killed: false, ran: suites.length };
}

main().then((outcome) => parentPort.postMessage(outcome), (error) => parentPort.postMessage({ killed: true, suite: 'load', by: [`crash: ${String(error && error.message).slice(0, 80)}`] }));
