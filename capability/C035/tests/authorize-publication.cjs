'use strict';

const fs = require('node:fs');
const source = require('..\\source.cjs');
const authority = require('..\\publisher-authority.cjs');
const mode = process.argv[2];
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' ||
    !(process.argv.length === 2 || process.argv.length === 3 && mode === 'actual')) {
  throw new Error('Exact deliberate current-authority assessment only; no source/path/identity overrides.');
}
const bytes = fs.readFileSync(0);
if (bytes.length > 65536) throw new Error('Bounded actual State snapshot required.');
const snapshot = require('..\\classifier.js').parseJson(bytes.toString('utf8'));
const assessed = mode === 'actual' ?
  authority.assessActual(snapshot, source.readRegular('.git\\kanban-orchestrator\\publish.ps1')) :
  authority.assessAuthority(snapshot);
console.log(JSON.stringify(assessed));
if (!assessed.approved || !assessed.delegationReady || mode === 'actual' && !assessed.exactActualBytes) process.exitCode = 1;
