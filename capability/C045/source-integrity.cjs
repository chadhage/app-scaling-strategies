'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');
const fixedDependencies = Object.freeze([
  'capability\\C001\\approved-contract.js', 'capability\\C001\\contract-guard.js',
  'capability\\C020\\contract.js', 'capability\\C020\\profiles.cjs', 'capability\\C020\\inspector.js',
  'capability\\C041\\accepted-catalog.js', 'capability\\C041\\host-policy.js',
  'capability\\C041\\lesson-host.js', 'capability\\C041\\serve.cjs', 'capability\\C041\\index.html',
  'testing\\browser\\isolated.cjs'
]);
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const pinsPath = 'capability\\C045\\evidence\\dependency-pins.json';
const authorityPath = 'capability\\C045\\evidence\\u071\\producer-authority.json';
const pinsRawSha256 = '479ebd80457159716eca3ae81dc8fb03652b8a09e213950076105c67bd35307b';
const pinsCanonicalSha256 = '0a644d84d69a3129102dd571f5dfaa0cb4c19da417f826ec63cdae862262dad1';
const authoritySha256 = '3fa6fe8d5ed785beee02d0d57e47d30cd17bd7926c6c4a7bd57ac654e6471412';

function readRegular(relative) {
  const expected = path.join(root, relative);
  const actual = fs.realpathSync(expected);
  const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (comparable(actual) !== comparable(expected) || !fs.statSync(actual).isFile()) {
    throw new Error('Only exact reviewed regular files are supported; redirected assets are refused.');
  }
  return fs.readFileSync(actual);
}

function readPins() {
  const bytes = readRegular(pinsPath);
  if (sha256(bytes) !== pinsRawSha256 && sha256(canonical(bytes)) !== pinsCanonicalSha256) {
    throw new Error(`Exact reviewed dependency pins changed: ${pinsPath}.`);
  }
  const value = JSON.parse(bytes);
  if (!Array.isArray(value.pins) || value.pins.length !== fixedDependencies.length
    || fixedDependencies.some(relative => value.pins.filter(pin => pin.path === relative).length !== 1)) {
    throw new Error('Exact reviewed dependency pins are unavailable.');
  }
  return value.pins;
}

function readAuthority() {
  const bytes = readRegular(authorityPath);
  if (sha256(bytes) !== authoritySha256) throw new Error(`Exact reviewed producer authority changed: ${authorityPath}.`);
  return JSON.parse(bytes);
}

function readDependency(relative) {
  if (!fixedDependencies.includes(relative)) throw new Error(`Not an approved fixed dependency: ${relative}.`);
  const pin = readPins().find(entry => entry.path === relative);
  const authority = readAuthority();
  const original = authority.dependencies.find(entry => entry.path === relative);
  const reviewed = authority.replacements.find(entry => entry.path === relative);
  const bytes = readRegular(relative);
  const rawSha256 = sha256(bytes);
  const crlfToLfSha256 = sha256(canonical(bytes));
  const acceptedOriginal = rawSha256 === pin.rawCheckoutSha256 || crlfToLfSha256 === original.crlfToLfSha256;
  const acceptedReviewed = reviewed && (rawSha256 === reviewed.rawSha256 || crlfToLfSha256 === reviewed.crlfToLfSha256);
  if (!acceptedOriginal && !acceptedReviewed) {
    throw new Error(`Reviewed dependency bytes changed: ${relative}. No silent repinning is allowed.`);
  }
  return bytes;
}

function verifyDependencies() {
  return Object.freeze(fixedDependencies.map(relative => {
    const bytes = readDependency(relative);
    return Object.freeze({ path: relative, rawCheckoutSha256: sha256(bytes), bytes: bytes.length });
  }));
}

module.exports = Object.freeze({ verifyDependencies, readDependency, readRegular, helperSha256, sha256 });
