'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { ManualClock } = require('./u005-support-world.cjs');
const bound = (label) => Object.assign(new Error(`U007_MUTATION_ITERATION_BOUND: ${label}`), { code: 'U007_MUTATION_ITERATION_BOUND' });
const now = ManualClock.prototype.now;
ManualClock.prototype.now = function () {
  this.u007MeasuredClockCalls = (this.u007MeasuredClockCalls || 0) + 1;
  if (this.u007MeasuredClockCalls > 10000) throw bound('10000 actual virtual-clock calls');
  return now.call(this);
};
const dirname = path.dirname;
let previous = null, repeats = 0;
path.dirname = function (value) {
  repeats = value === previous ? repeats + 1 : 0;
  previous = value;
  if (repeats > 128) throw bound('128 repeated actual dirname calls');
  return dirname(value);
};
const opendir = fs.promises.opendir;
fs.promises.opendir = async function (...args) {
  const dir = await opendir.apply(this, args);
  const read = dir.read.bind(dir);
  let calls = 0;
  dir.read = async (...parameters) => {
    calls += 1;
    if (calls > 258) throw bound('258 actual reads of one directory');
    return read(...parameters);
  };
  return dir;
};
