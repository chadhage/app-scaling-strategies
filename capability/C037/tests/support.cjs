'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repository = path.resolve(__dirname, '..', '..', '..');
const scripts = [
  ['C020', 'contract.js'], ['C020', 'inspector.js'], ['C033', 'journey.js'],
  ['C034', 'evidence', 'raw', 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116', 'bundle.js'],
  ['C034', 'trace.js'], ['C036', 'captured.js'], ['C036', 'attribution.js'], ['C037', 'routing.js']
];
async function browserModel() {
  const context = vm.createContext({ TextEncoder, TextDecoder, Uint8Array });
  vm.runInContext('globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));', context);
  for (const pieces of scripts) {
    const file = path.join(repository, 'capability', ...pieces);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 1000 });
  }
  return context.C037Routing.open();
}
const copy = (value) => JSON.parse(JSON.stringify(value));
async function evaluate(id, edit, operation = 'compareText') {
  const model = await browserModel();
  const input = copy(model.getFixture(id));
  if (edit) edit(input);
  const result = await model[operation](JSON.stringify(input));
  return { model, input, result: copy(result) };
}
function inventory(directory, ignoreRaw = false) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No linked immutable inventory entries.');
    if (entry.isDirectory()) return ignoreRaw && entry.name === 'raw' ? [] : inventory(file, ignoreRaw);
    return [{ path: path.relative(repository, file), sha256: require('..\\pins.cjs').hash(fs.readFileSync(file)) }];
  });
}
module.exports = Object.freeze({ browserModel, evaluate, copy, inventory, scripts });
