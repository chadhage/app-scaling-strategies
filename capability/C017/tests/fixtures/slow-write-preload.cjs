'use strict';

// Test tooling, not production code: node --require preload that models a SLOW disk for the child heap sampler. A write to the sample file
// (or to any temp file beside it) truncates the target, then holds it empty for 150 ms before the bytes arrive. A reader that polls the
// sample file therefore sees a half-written file on every sample unless the writer publishes the sample atomically (temp file plus rename).
// It must be required BEFORE child-preload.cjs, which captures fs.writeFileSync when it loads.
const fs = require('node:fs');

const realWrite = fs.writeFileSync;
const prefix = process.env.C017_MEM_FILE;
const pause = new Int32Array(new SharedArrayBuffer(4));

fs.writeFileSync = function slowWrite(file, data, ...rest) {
  if (!prefix || typeof file !== 'string' || !file.startsWith(prefix)) return realWrite.call(this, file, data, ...rest);
  const fd = fs.openSync(file, 'w');
  Atomics.wait(pause, 0, 0, 150);
  fs.writeSync(fd, data);
  return fs.closeSync(fd);
};
