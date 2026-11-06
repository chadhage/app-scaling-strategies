'use strict';

// The mutants of the second fix run (R3-U009): one or more for every new guard (the step counter of the glob matcher, the spellings of --json, the not-run
// report for --help, the hard-link refusal, the identity check before the final write, the temporary file and rename, the read-only retry).
// Each one changes one expression of one production file; `find` must occur exactly once in that file (the tool checks it).
const round3 = [
  { id: 'R01-no-early-exit', file: 'glob.cjs', find: 'if (!alive) return { matched: false, steps, consumed };', replace: 'void alive;', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R02-dead-steps-lost', file: 'glob.cjs', find: 'if (!alive) return { matched: false, steps, consumed };', replace: 'if (!alive) return { matched: false, steps: 0, consumed };', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R03-characters-not-counted', file: 'glob.cjs', find: 'consumed += 1;', replace: 'void consumed;', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R04-scan-not-counted', file: 'glob.cjs', find: 'steps += count;', replace: 'void count;', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R05-closure-not-counted', file: 'glob.cjs', find: 'steps += close(following, kinds);', replace: 'close(following, kinds);', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R06-first-closure-not-counted', file: 'glob.cjs', find: 'let steps = close(active, kinds);', replace: 'close(active, kinds); let steps = 0;', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R07-closure-costs-nothing', file: 'glob.cjs', find: 'return kinds.length;', replace: 'return 0;', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R08-states-never-advance', file: 'glob.cjs', find: '[active, following] = [following, active];', replace: '[active, following] = [active, following];', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R09-tokens-not-reported', file: 'glob.cjs', find: 'measure: (input) => ({ ...run(compiled, String(input)), tokens })', replace: 'measure: (input) => ({ ...run(compiled, String(input)), tokens: 0 })', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'R11-hard-link-allowed', file: 'output.cjs', find: 'if (stat.nlink > 1) throw refuse(', replace: 'if (false) throw refuse(', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R12-equals-spelling-ignored', file: 'output.cjs', find: "argument.startsWith('--json=') && argument.length", replace: 'false && argument.length', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R13-empty-equals-value-is-a-path', file: 'output.cjs', find: "argument.length > '--json='.length", replace: 'true', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R14-identity-not-compared', file: 'output.cjs', find: 'if (identityOf(stat) !== expected) throw changed(', replace: 'if (false) throw changed(', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R15-final-check-skipped', file: 'output.cjs', find: '    checkReportTarget(target, { fsApi });', replace: '    void target;', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R16-write-through-the-link', file: 'output.cjs', find: '    replace(temp, target, fsApi);', replace: '    fsApi.writeFileSync(target, fsApi.readFileSync(temp)); fsApi.unlinkSync(temp);', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R17-no-read-only-retry', file: 'output.cjs', find: "const REPLACE_RETRY = new Set(['EPERM', 'EACCES']);", replace: 'const REPLACE_RETRY = new Set([]);', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R18-temporary-file-kept', file: 'output.cjs', find: '      fsApi.unlinkSync(temp);', replace: '      void temp;', tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R19-temporary-file-not-exclusive', file: 'output.cjs', find: "{ flag: 'wx' }", replace: "{ flag: 'w' }", tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R20-changed-code-lost', file: 'output.cjs', find: "code: 'REPORT_CHANGED'", replace: "code: 'CHANGED'", tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R22-not-run-status-lost', file: 'output.cjs', find: "status: 'not-run'", replace: "status: 'not-run-x'", tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R23-not-run-is-a-pass', file: 'output.cjs', find: "return { schema: SCHEMA, pass: false, status: 'not-run', message };", replace: "return { schema: SCHEMA, pass: true, status: 'not-run', message };", tests: ['output.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R24-help-leaves-the-old-pass', file: 'gate.cjs', find: "replaceReports(argv, notRunReport('--help was given: nothing was measured, so this file is not a result'), deps);", replace: 'void notRunReport;', tests: ['gate-fixes.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R25-final-write-unchecked', file: 'gate.cjs', find: '{ fsApi, expected: marker }', replace: '{ fsApi }', tests: ['gate-fixes.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R26-failure-overwrites-a-foreign-file', file: 'gate.cjs', find: 'checkReportTarget(target, { fsApi: deps.fsApi });', replace: 'void target;', tests: ['gate-fixes.test.cjs', 'fix2-json.test.cjs'] },
  { id: 'R27-marker-identity-lost', file: 'gate.cjs', find: 'marker = writeReportFile(reportTarget, startedReport(), { fsApi });', replace: 'writeReportFile(reportTarget, startedReport(), { fsApi });', tests: ['gate-fixes.test.cjs', 'fix2-json.test.cjs'] }
];

module.exports = Object.freeze({ round3 });
