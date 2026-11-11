'use strict';
const { lf } = require('./integrity.cjs');
function representation(file, bytes, kind) {
  if (file.endsWith('.jsonl')) return Buffer.from(bytes);
  const source = lf(bytes);
  return kind === 'lf' ? source : Buffer.from(source.toString('utf8').replace(/\n/g, '\r\n'));
}
module.exports = { representation };
