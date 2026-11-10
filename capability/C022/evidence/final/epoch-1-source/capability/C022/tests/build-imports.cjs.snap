'use strict';

// Test tooling, not production code: computes the pins of every file C022 imports READ-ONLY from git (the accepted commit), never from
// the file next to the pin (L-0116), and writes imports.json with --write (flag wx: an existing file is never overwritten).
//   node capability\C022\tests\build-imports.cjs            prints the pins
//   node capability\C022\tests\build-imports.cjs --write    creates capability\C022\imports.json
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: repo, encoding, maxBuffer: 1 << 26 });

const WANTED = [
  { card: 'C009', path: 'capability/C009/http-io.cjs', tag: 'kanban/C009/f95cc52a29cf', usedBy: 'server.cjs (the refusal path, the per-connection lanes, the answers Node gives itself, the fail-closed read stop, readBody, localGuard)' },
  { card: 'C009', path: 'capability/C009/codes.cjs', tag: 'kanban/C009/f95cc52a29cf', usedBy: 'transitive through http-io.cjs (the typed answers of Node-own refusals: 408, 417, 421, 431, 400, 405)' },
  { card: 'C009', path: 'capability/C009/queue.cjs', tag: 'kanban/C009/f95cc52a29cf', usedBy: 'server.cjs (the linearizing commit queue)' },
  { card: 'C020', path: 'capability/C020/profiles.cjs', tag: 'kanban/C020/2dc471daab3f', usedBy: 'service.cjs (getProfileV2: the synthetic profiles each tenant may see)' },
  { card: 'C020', path: 'capability/C020/contract.js', tag: 'kanban/C020/2dc471daab3f', usedBy: 'transitive through profiles.cjs (the frozen synthetic catalog and stamps)' },
  { card: 'flow-browser', path: 'testing/browser/isolated.cjs', tag: 'kanban/flow-browser/53c0c0d82cc1', usedBy: 'tests/browser.cjs only (the shared isolated headless Edge helper; never edited by C022)' },
  { card: 'U018', path: 'testing/browser/qualify/qualify.cjs', tag: 'kanban/U018/91ca6c9e97e1', usedBy: 'tests/browser.cjs only (qualifyEdge: Microsoft-signed and a qualified major, no equality pin)' }
];

function pins() {
  return WANTED.map((entry) => {
    const commit = git(['rev-parse', `${entry.tag}^{commit}`]).trim();
    const bytes = fs.readFileSync(path.join(repo, entry.path));
    const blob = git(['show', `${commit}:${entry.path}`], 'buffer');
    return { ...entry, commit, raw: sha(bytes), git: sha(blob), lf: sha(lf(bytes)) };
  });
}

if (require.main === module) {
  const dependencies = pins();
  const document = {
    schema: 'C022-imports/1',
    accepted: {
      C009: { commit: dependencies[0].commit, tag: 'kanban/C009/f95cc52a29cf', note: 'PRODUCTION bytes only (never its tests or evidence). C009 was not accepted when C022 started: its third fix changes tests, README and evidence only, every production file frozen; re-pin if the controller says a production file changed.' },
      C020: { commit: dependencies[3].commit, tag: 'kanban/C020/2dc471daab3f', note: 'accepted; its later K commit 31bc2248 added tests only' }
    },
    dependencies,
    c009ReadmeFalseLine: 'The C009 README importer section says admit.refuse(socket, code, { immediate }); the function takes (socket, code) and "immediate" occurs nowhere (review F14). C022 uses it as (socket, code) and tests that arity.',
    policy: 'Unchanged read-only imports of accepted producer bytes. The raw working bytes, the LF-normalized bytes and the Git blob at the accepted commit are separate pins; tests\\anchor.cjs recomputes them against git. No pin authorizes a live run and C022 never edits an imported file.'
  };
  if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(__dirname, '..', 'imports.json'), `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
    console.log('imports.json written');
  } else {
    console.log(JSON.stringify(document, null, 2));
  }
}

module.exports = Object.freeze({ WANTED, pins });
