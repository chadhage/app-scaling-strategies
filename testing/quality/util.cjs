'use strict';
// Pure helpers shared by the rule modules. No I/O, no clock, no randomness.
const crypto = require('node:crypto');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = (v) => Array.isArray(v);
const approx = (a, b, eps = 1e-6) => isNum(a) && isNum(b) && Math.abs(a - b) <= eps;
const round = (x, d = 6) => Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d;

// The packet convention: ceiling = ceil(worst case x 1.25 / 5) x 5 (rounded first against float noise).
const ceilingFor = (worst) => Math.ceil(round((worst * 1.25) / 5, 9)) * 5;

// Integrity: SHA-256 of JSON.stringify of the packet without the integrity and validation fields, keys in construction order.
function integrityHash(packet) {
  const { integrity, validation, ...body } = packet;
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function makeSink() {
  const findings = [];
  const add = (code, path, message) => { findings.push({ code, path, message }); };
  return { findings, add };
}

module.exports = { isObj, isNum, isStr, isArr, approx, round, ceilingFor, integrityHash, makeSink };
