'use strict';
const fs = require('node:fs');
if (process.env.C047_ADMISSION) {
  const until = Date.parse(process.env.C047_WORKER_DEADLINE);
  while (!fs.existsSync(process.env.C047_ADMISSION)) {
    if (Date.now() >= until) throw new Error('C047_FIXED_WORKER_DEADLINE');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  const admitted = JSON.parse(fs.readFileSync(process.env.C047_ADMISSION));
  if (admitted.pid !== process.pid || Date.now() >= until) throw new Error('C047_ADMISSION_IDENTITY_OR_DEADLINE');
}
