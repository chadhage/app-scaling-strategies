'use strict';

// The mutants of the U009 fix run (R2-U009): the 23 of the first publication, adapted where the code moved, and one or more for every fix.
// Each one changes one expression of one production file; `find` must occur exactly once in that file (the tool checks it).
const fixes = [
  { id: 'N01-env-key-only-deleted', file: 'command.cjs', find: 'environment.NODE_V8_COVERAGE = undefined;', replace: 'delete environment.NODE_V8_COVERAGE;',   tests: ['command.test.cjs'] },
  { id: 'N02-env-override-lost', file: 'command.cjs', find: '    environment[name] = value;', replace: '    void value;', tests: ['command.test.cjs'] },
  { id: 'N03-internal-error-exits-0', file: 'gate.cjs', find: '    return 1;', replace: '    return 0;',   tests: ['gate.test.cjs', 'gate-fixes.test.cjs'] },
  { id: 'N04-entry-rejection-exits-0', file: 'gate.cjs', find: '    exit(1);', replace: '    exit(0);', tests: ['gate-fixes.test.cjs'] },
  { id: 'N05-failure-report-not-printed', file: 'gate.cjs', find: 'deps.stdout(`${JSON.stringify(failure, null, 2)}\\n`);', replace: "deps.stdout('{\"schema\":\"x\",\"pass\":true,\"error\":{}}\\n');", tests: ['gate.test.cjs'] },
  { id: 'N06-table-tolerance-loose', file: 'evaluate.cjs', find: 'const TABLE_TOLERANCE = 0.0051;', replace: 'const TABLE_TOLERANCE = 0.5;', tests: ['evaluate.test.cjs'] },
  { id: 'N07-no-started-marker', file: 'gate.cjs', find: 'writeReportFile(reportTarget, startedReport(), { fsApi });', replace: 'void startedReport;', tests: ['gate-fixes.test.cjs'] },
  { id: 'N08-failure-not-written-to-json', file: 'gate.cjs', find: 'writeReportFile(target, failure, { fsApi: deps.fsApi });', replace: 'void failure;',   tests: ['gate-fixes.test.cjs'] },
  { id: 'N09-json-flag-not-scanned', file: 'output.cjs', find: 'targets.push(value);', replace: 'void value;', tests: ['output.test.cjs', 'gate-fixes.test.cjs'] },
  { id: 'N10-star-crosses-segments', file: 'glob.cjs', find: "const separator = character === '/';", replace: 'const separator = false;', tests: ['glob.test.cjs'] },
  { id: 'N11-pattern-length-unbounded', file: 'glob.cjs', find: 'if (text.length > MAX_PATTERN_LENGTH) throw new UsageError(', replace: 'if (false) throw new UsageError(', tests: ['glob.test.cjs'] },
  { id: 'N12-globstar-group-cannot-be-skipped', file: 'glob.cjs', find: 'marks[state + 3] = 1;', replace: 'void state;', tests: ['glob.test.cjs', 'enumerate.test.cjs'] },
  { id: 'N13-states-never-reset', file: 'glob.cjs', find: 'following.fill(0);', replace: 'void following;', tests: ['glob.test.cjs', 'fix-f4-glob.test.cjs'] },
  { id: 'N14-any-json-object-is-a-report', file: 'output.cjs', find: "document === null || typeof document !== 'object' || document.schema !== SCHEMA", replace: 'document === null',   tests: ['output.test.cjs'] },
  { id: 'N15-script-name-allowed', file: 'output.cjs', find: 'if (SCRIPT_EXTENSIONS.has(path.extname(target).toLowerCase())) {', replace: 'if (false) {',   tests: ['output.test.cjs'] },
  { id: 'N16-directory-not-named', file: 'output.cjs', find: "if (stat.isDirectory()) throw refuse(target, 'it is a directory');", replace: 'void stat;', tests: ['output.test.cjs'] },
  { id: 'N17-null-device-allowed', file: 'output.cjs', find: 'con|prn|aux|nul|', replace: 'con|prn|aux|nulx|',   tests: ['output.test.cjs'] },
  { id: 'N18-link-allowed', file: 'output.cjs', find: "if (stat.isSymbolicLink()) throw refuse(target, 'it is a link');", replace: 'void stat;', tests: ['output.test.cjs'] },
  { id: 'N19-data-stream-allowed', file: 'output.cjs', find: "if (withoutDrive.includes(':')) return", replace: 'if (false) return', tests: ['output.test.cjs'] },
  { id: 'N20-huge-file-read', file: 'output.cjs', find: 'if (stat.size > MAX_REPORT_BYTES) throw', replace: 'if (false) throw', tests: ['output.test.cjs'] },
  { id: 'N21-json-target-unchecked', file: 'gate.cjs', find: 'checkReportTarget(reportTarget, { fsApi });', replace: 'void checkReportTarget;',   tests: ['gate-fixes.test.cjs'] },
  { id: 'N22-nothing-listed-as-not-considered', file: 'enumerate.cjs', find: 'notConsidered: notConsideredOf(listing.files),', replace: 'notConsidered: [],', tests: ['fix-minors.test.cjs'] },
  { id: 'N23-empty-file-never-told-apart', file: 'gate.cjs', find: 'empty: record === undefined && isEmptyFile(file, fsApi)', replace: 'empty: false', tests: ['gate-fixes.test.cjs'] },
  { id: 'N24-empty-reason-unused', file: 'evaluate.cjs', find: 'else if (runProblem === null && !loaded && empty) problems.push(EMPTY_FILE_REASON);', replace: 'else if (false) problems.push(EMPTY_FILE_REASON);', tests: ['fix-minors.test.cjs'] },
  { id: 'N25-created-folders-kept', file: 'gate.cjs', find: 'removeCreatedFolders(createdFolders, fsApi);', replace: 'void createdFolders;', tests: ['gate.test.cjs', 'fix-minors.test.cjs'] },
  { id: 'N26-scratch-parent-race-not-retried', file: 'gate.cjs', find: "if (error.code !== 'ENOENT' || attempt >= 3) throw error;", replace: 'throw error;', tests: ['gate-fixes.test.cjs'] },
  { id: 'N27-repeated-scalar-flag-allowed', file: 'gate.cjs', find: 'if (raw[SCALAR_FLAGS[flag]] !== undefined) throw new UsageError(', replace: 'if (false) throw new UsageError(', tests: ['fix-minors.test.cjs'] },
  { id: 'N28-always-full-bar', file: 'evaluate.cjs', find: 'fullBar: reasons.length === 0,', replace: 'fullBar: true,', tests: ['fix-minors.test.cjs', 'gate-fixes.test.cjs'] },
  { id: 'N29-low-minimum-is-full-bar', file: 'evaluate.cjs', find: 'if (min < FULL_BAR) reasons.push(', replace: 'if (false) reasons.push(', tests: ['fix-minors.test.cjs'] },
  { id: 'N30-node-modules-case-sensitive', file: 'enumerate.cjs', find: "entry.name.toLowerCase() === 'node_modules'", replace: "entry.name === 'node_modules'", tests: ['fix-minors.test.cjs'] },
  { id: 'N31-no-grace-timer', file: 'runner.cjs', find: 'grace = setTimeout(() => finish({}), graceMs);', replace: 'void graceMs;', tests: ['runner.test.cjs'] }
];

module.exports = Object.freeze({ fixes });
