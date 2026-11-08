'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chain = require('./u040-chain.cjs');
const PREFIX = 'capability\\C026\\';
const SEAL = `${PREFIX}evidence\\u055\\final-byte-seal.json`;
const ANCHOR = `${PREFIX}evidence\\u055\\final-byte-seal-anchor.json`;
const repository = path.resolve(__dirname, '..', '..', '..');
const list = (directory) => fs.readdirSync(path.join(repository, directory), { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? list(`${directory}${entry.name}\\`) : [`${directory}${entry.name}`]);
const files = () => list(PREFIX).filter((relative) => relative !== SEAL && relative !== ANCHOR).sort();
const read = (relative) => {
  try { return fs.readFileSync(path.join(repository, relative)); } catch { return null; }
};

function verify(readBytes = read) {
  const errors = [];
  const anchorBytes = readBytes(ANCHOR);
  const sealBytes = readBytes(SEAL);
  if (anchorBytes === null || sealBytes === null) return { ok: false, errors: ['U055_FINAL_BYTE_SEAL_MISSING'] };
  let anchor;
  let seal;
  try { anchor = JSON.parse(anchorBytes); seal = JSON.parse(sealBytes); } catch { return { ok: false, errors: ['U055_FINAL_BYTE_SEAL_UNPARSABLE'] }; }
  if (anchor.schema !== 'C026-U055-final-byte-seal-anchor/1' || anchor.path !== SEAL || anchor.rawSha256 !== chain.sha(sealBytes)) {
    return { ok: false, errors: [`FINAL_SEAL_CHANGED ${SEAL}`] };
  }
  if (seal.schema !== 'C026-U055-final-byte-seal/1' || !Array.isArray(seal.files)) return { ok: false, errors: ['U055_FINAL_BYTE_SEAL_BAD_HEADER'] };
  if (JSON.stringify(seal.files.map((entry) => entry.path)) !== JSON.stringify(files())) errors.push('U055_FINAL_BYTE_SET_CHANGED');
  for (const entry of seal.files) {
    const bytes = readBytes(entry.path);
    if (bytes === null || bytes.length !== entry.bytes || chain.sha(bytes) !== entry.rawSha256) errors.push(`FINAL_BYTES_CHANGED ${entry.path}`);
  }
  return { ok: errors.length === 0, errors, checkedFiles: seal.files.length };
}

if (require.main === module) {
  if (process.argv[2] === 'write') {
    const seal = {
      schema: 'C026-U055-final-byte-seal/1',
      note: 'Created once after all U055 captures; covers every namespace file except this seal and its independent anchor. Does not authenticate a coordinated rewrite.',
      files: files().map((relative) => { const bytes = read(relative); return { path: relative, bytes: bytes.length, rawSha256: chain.sha(bytes) }; })
    };
    const bytes = Buffer.from(`${JSON.stringify(seal, null, 2)}\n`);
    fs.writeFileSync(path.join(repository, SEAL), bytes, { flag: 'wx' });
    fs.writeFileSync(path.join(repository, ANCHOR), `${JSON.stringify({ schema: 'C026-U055-final-byte-seal-anchor/1', path: SEAL, rawSha256: chain.sha(bytes) }, null, 2)}\n`, { flag: 'wx' });
  } else if (process.argv[2] !== 'verify') throw new Error('U055 seal requires write or verify.');
  const result = verify();
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

module.exports = Object.freeze({ SEAL, ANCHOR, verify });
