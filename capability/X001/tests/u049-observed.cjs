'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function observed(source = fs.readFileSync(path.join(__dirname, '..', 'timeline.js'), 'utf8')) {
  const metrics = { calls: [], boundHit: false };
  let current;
  const probe = {
    begin() { current = { steps: 0, reads: 0, charged: 0, allocated: 0 }; metrics.calls.push(current); },
    step() {
      current.steps += 1;
      if (current.steps > 210000) {
        metrics.boundHit = true;
        assert.fail('G1 counted ownership walk exceeded 210000 actual iterations');
      }
    },
    read() { current.reads += 1; },
    charge(nodes) { current.charged = nodes; },
    allocate() { current.allocated += 1; },
  };
  const anchors = [
    ['function own(root) {', 'function own(root) { __u049Probe.begin();'],
    ['while (frames.length > 0) {', 'while (frames.length > 0) { __u049Probe.step();'],
    ['nodes += size + 1;', 'nodes += size + 1; __u049Probe.charge(nodes);'],
    ['const value = frame.source[key];', '__u049Probe.read(); const value = frame.source[key];'],
    ['onPath.add(source);', '__u049Probe.allocate(); onPath.add(source);'],
  ];
  for (const [before, after] of anchors) {
    assert.equal(source.split(before).length, 2, `one measured ownership anchor: ${before}`);
    source = source.replace(before, after);
  }
  const target = path.join(__dirname, '..', 'timeline.u049-observed.cjs');
  const subject = new Module(target, module);
  subject.filename = target;
  subject.paths = module.paths;
  globalThis.__X001_U049_PROBE = probe;
  try {
    subject._compile(`const __u049Probe = globalThis.__X001_U049_PROBE;\n${source}`, target);
  } finally {
    delete globalThis.__X001_U049_PROBE;
  }
  return { model: subject.exports, metrics };
}

module.exports = Object.freeze({ observed });
