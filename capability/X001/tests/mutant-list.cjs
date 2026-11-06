'use strict';

// The catalog of the systematic mutation self-check (tests\mutants.cjs): which suites exercise which production file (pass 1, fastest first), every suite
// that survivors still run (pass 2), the six single-line mutants the independent reviewer found alive after the first publication (they are mutated by
// name as well as by the generator) and the EQUIVALENT mutants with a one-line PROOF of equivalence (a reachability argument is not a proof).
const suites = Object.freeze({
  'timeline.js': ['timeline.test.cjs', 'totality.test.cjs', 'aliasing.test.cjs', 'guards.test.cjs', 'describe.test.cjs', 'killers.test.cjs'],
  'describe.js': ['describe.test.cjs', 'killers.test.cjs', 'page.test.cjs', 'guards.test.cjs'],
  'page.js': ['page.test.cjs', 'killers.test.cjs', 'guards.test.cjs'],
});
const pass2 = ['timeline.test.cjs', 'totality.test.cjs', 'aliasing.test.cjs', 'describe.test.cjs', 'killers.test.cjs', 'guards.test.cjs', 'page.test.cjs', 'surface.test.cjs', 'exhaustive.test.cjs', 'properties.test.cjs'];

const named = [
  { name: 'B12-gap-position-off-by-one', file: 'timeline.js', find: 'position: index + 1, epoch: step.flags.gap.epoch', replace: 'position: index, epoch: step.flags.gap.epoch' },
  { name: 'D1-reconnects-shows-disconnects', file: 'describe.js', find: "['reconnects', 'Reconnects', counts.reconnects]", replace: "['reconnects', 'Reconnects', counts.disconnects]" },
  { name: 'D2-resyncs-shows-reconnects', file: 'describe.js', find: "['resyncs', 'Resyncs', counts.resyncs]", replace: "['resyncs', 'Resyncs', counts.reconnects]" },
  { name: 'D6-epoch-changes-shows-gaps', file: 'describe.js', find: "['epoch-changes', 'Epoch changes', state.epochChanges.length]", replace: "['epoch-changes', 'Epoch changes', state.gaps.length]" },
  { name: 'D7-connection-constant', file: 'describe.js', find: "['connection', 'Connection', state.connection]", replace: "['connection', 'Connection', 'open']" },
  { name: 'P12-verification-failure-shown-as-verified', file: 'page.js', find: "$('verified').textContent = check.ok", replace: "$('verified').textContent = true" },
];

// id -> proof. Filled from the report of the campaign: only mutants that no behavior can distinguish.
const equivalents = {
  'page.js:string-changed:96b72c3a97': 'the initial text of the third span of a row is rewritten by render() for every row (current position or empty) and loadRun calls moveTo, which renders, right after listEntries, so the initial text is never observed',
  'timeline.js:operand-&&-true:ba49949ddd': 'onPath holds only objects accepted by enter(), so Set.has(null) and Set.has(a primitive) are false: the operand value !== null excludes nothing the set could contain',
  'timeline.js:operand-&&-true:fb677c686a': 'onPath holds only objects, so Set.has of anything that is not an object is false: the operand typeof value === object excludes nothing the set could contain',
  'timeline.js:ternary-false:5e9c3906dc': 'for an array the variable named is read nowhere (size takes source.length and keys takes the index list); Object.keys(array) only costs time',
  'timeline.js:operand-&&-true:69eefe1232': 'for a plain object keys are its own enumerable names, so Object.hasOwn(source, key) is true for every key, keys.every is true and the sparse guard cannot fire',
  'timeline.js:boolean-flipped:e15eb2c24f': 'Object.freeze(frame.copy) runs after the last property of every copy is defined and sets writable and configurable to false on every own property',
  'timeline.js:boolean-flipped:f5acff33c4': 'Object.freeze(frame.copy) runs after the last property of every copy is defined and sets writable and configurable to false on every own property',
  'timeline.js:boolean-flipped:649fde569e': 'the states of the verification pass are local to verify, are only read by canonical() and are never returned, so freezing them changes no output',
  'describe.js:operand-||-true:e7c0d1ba55': 'in `answer.entry.data || {}` the operand is only used to destructure step and of: destructuring true reads (true).step and (true).of, both undefined, exactly what {} gives',
  'describe.js:operand-||-false:82d50ca781': 'in `answer.entry.data || {}` the operand is only used to destructure step and of: destructuring false reads (false).step and (false).of, both undefined, exactly what {} gives',
  'describe.js:operator-??:89518c6bd3': 'JSON.stringify returns undefined or a non-empty string (the shortest JSON text has one character), never an empty string or another falsy value, so `x ?? y` and `x || y` choose the same side',
  'describe.js:operand-&&-true:a26e753750': 'in a CommonJS module `module.exports` is an object, hence truthy, whenever `module` is an object: the operand excludes nothing that `typeof module === "object"` lets through',
};

module.exports = Object.freeze({ catalog: Object.freeze({ suites, pass2, named, equivalents }) });
