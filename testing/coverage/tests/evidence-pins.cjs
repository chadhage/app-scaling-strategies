'use strict';

// The EXPECTED evidence, by relative path below evidence\ (N5 of the second review): a missing or an unexpected archive fails the evidence test.
// A consistent rewrite of the README, the tests and these pins is not detectable by any test in the repository: only git history against the accepted commit shows it.
const PRODUCTION = ['command', 'enumerate', 'errors', 'evaluate', 'gate', 'glob', 'output', 'report', 'runner'];
const l0004 = (base, names) => names.map((name) => `${base}coverage/l0004-${name}.json`);

// First publication (commit 8cfdce17f62c): 14 manifests, the first generation had no L-0004 run of output.cjs.
const FIRST = [
  'c031/c031-run-2.json', 'c031/c031-run-3.json', ...l0004('', PRODUCTION.filter((name) => name !== 'output')),
  'coverage/self-gate-run-1.json', 'green/green-01-suite.json', 'mutation/mutation-01.json', 'red/red-01-behavior.json'
];

// First fix (commit 85ee70a3d4c9): 20 final manifests and 6 REDs.
const FIX1 = [
  'fix/c031/c031-run-4.json', 'fix/c031/c031-run-5.json', ...l0004('fix/', PRODUCTION),
  'fix/coverage/self-gate-run-2.json', 'fix/green/green-02-suite.json', 'fix/mutation/mutation-02.json',
  ...['f1-env', 'f2-exit', 'f3-stale', 'f4-glob', 'f5-json', 'minors'].map((name) => `fix/replay/replay-01-${name}.json`),
  'red/fix-f1-env-00c94491-c97f-4fb9-bde8-88b9f54f3c88/red-01-f1-env.json', 'red/fix-f2-exit-807ad2c8-e754-4a3c-a02f-31629901e3aa/red-01-f2-exit.json',
  'red/fix-f3-stale-fce42585-dca9-4e36-bb27-2d02605f9a35/red-01-f3-stale.json', 'red/fix-f4-glob-8810ad5d-ee35-41ed-975c-9b67390b1a96/red-01-f4-glob.json',
  'red/fix-f5-json-7117c5ca-a098-4eff-8bc3-3739225c28ed/red-01-f5-json.json', 'red/fix-minors-e24b5ec1-835f-4656-a181-3d39df71bdbe/red-01-minors.json'
];

// Second fix (this round): the final archives, the REDs that each have an unchanged replay, and the first RED of N3 and N4, which was run on a test file that
// was corrected before its first GREEN (it passed --help together with --json=<path>, a usage error): kept as history, superseded by red-02-n3-json.
const FIX2 = {
  finals: [
    'fix2/c031/c031-run-6.json', 'fix2/c031/c031-run-7.json', ...l0004('fix2/', PRODUCTION), 'fix2/coverage/self-gate-run-3.json', 'fix2/mutation/mutation-03.json',
    'fix2/replay/replay-01-n1-glob.json', 'fix2/replay/replay-01-n3-json.json', 'fix2/replay/replay-01-n2-hermetic.json', 'fix2/strict/strict-run-01.json'
  ],
  reds: [
    'red/fix2-n1-glob-27ada9f1-0c4c-4ef0-a48d-fe76784a2a3e/red-01-n1-glob.json',
    'red/fix2-n3-json-b-1c9403ea-2a3b-46f6-96d9-9e987e546308/red-02-n3-json.json',
    'red/fix2-n2-hermetic-d1e9327b-c409-4b3d-a2f7-3c33e3ac024e/red-01-n2-hermetic.json'
  ],
  superseded: ['red/fix2-n3-json-0d050a7f-3200-496f-ac58-62c63293ad45/red-01-n3-json.json'],
  // The green run executes the evidence test itself, so it cannot be pinned as required: it is allowed to exist, and the evidence test never needs it.
  optional: ['fix2/green/green-03-suite.json'],
  // The gate's own report files of the final runs (they are no recorder manifests): present, pass and fullBar.
  reports: { self: 'fix2/coverage/self-gate-report-3.json', c031: ['fix2/c031/c031-run-6-report.json', 'fix2/c031/c031-run-7-report.json'] }
};

module.exports = Object.freeze({ PRODUCTION, FIRST, FIX1, FIX2 });
