'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('./pins.cjs');
const trace = require('./trace.js');
const directory = path.join(__dirname, 'evidence', 'raw', 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116');
const expected = {
  'bundle.json': '2e3819524ac431dd81d21497585e1b42157b56240b81b8f1929764c1c251cd56',
  'bundle.js': '87e87e76a142f8a53d52b9f0da259742363f6d8b5da40895538e76c565ffcfcd'
};
let json;
for (const [name, sha256] of Object.entries(expected)) {
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > trace.MAX_BYTES ||
      fs.realpathSync(file) !== file || fs.lstatSync(directory).isSymbolicLink()) {
    throw Object.assign(new Error('UNSAFE_SAVED_TRACE_FILE'), { code: 'UNSAFE_SAVED_TRACE_FILE' });
  }
  const bytes = fs.readFileSync(file);
  if (hash(bytes) !== sha256) throw Object.assign(new Error('SAVED_TRACE_BYTE_MISMATCH'), { code: 'SAVED_TRACE_BYTE_MISMATCH' });
  if (name === 'bundle.json') json = bytes.toString('utf8');
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
module.exports = freeze(trace.parseJson(json));
