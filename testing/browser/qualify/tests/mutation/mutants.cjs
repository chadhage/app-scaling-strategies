'use strict';

// The mutants of the fix (F1 to F6 and the review's own list M01 to M28). Every pattern is a single-line text that occurs
// exactly once in its file; mutate.cjs refuses a pattern that does not (PATTERN-NOT-UNIQUE) and never edits the real tree.
const m = (id, file, find, replace, timeoutSeconds) => ({ id, file, find, replace, timeoutSeconds });

const MUTANTS = [
  // the review's mutants (qualify.cjs, subject.cjs, version.cjs, adapters.cjs), adapted to the fixed code
  m('M01-publisher-substring', 'qualify.cjs', "if (!organization.ok || organization.organization !== REQUIRED_ORGANIZATION) {", "if (!organization.ok || !organization.organization.includes('Microsoft')) {"),
  m('M02-valid-status-check-dropped', 'qualify.cjs', "if (found.status !== 'Valid') add('SIGNATURE_NOT_VALID', `the Authenticode status is ${found.status}, not Valid`);", "if (false) add('SIGNATURE_NOT_VALID', 'x');"),
  m('M03-major-relaxed-to-gte', 'qualify.cjs', "if (majors.ok && !majors.majors.includes(parsed.major)) {", "if (majors.ok && !majors.majors.some((major) => parsed.major >= major)) {"),
  m('M04-unparsable-version-not-a-failure', 'qualify.cjs', "add('VERSION_UNPARSABLE', `${JSON.stringify(answer.value)}: ${parsed.error}`);", 'void 0;'),
  m('M05-last-existing-candidate', 'qualify.cjs', 'const chosen = looks.findIndex((look) => look.exists);', 'const chosen = looks.map((look) => look.exists).lastIndexOf(true);'),
  m('M06-mtime-recheck-dropped', 'qualify.cjs', ' && last.size === looks[chosen].size && last.mtimeMs === looks[chosen].mtimeMs)) {', ' && last.size === looks[chosen].size)) {'),
  m('M07-equality-pin-on-version', 'qualify.cjs', "report.ok = findings.length === 0 && report.signature.status === 'Valid'", "report.ok = findings.length === 0 && report.version === '156.0.4314.50' && report.signature.status === 'Valid'"),
  m('M08-hash-equality-pin', 'qualify.cjs', 'report.sha256 = answer.value.toLowerCase();', "report.sha256 = answer.value.toLowerCase(); if (report.sha256 !== 'd35d48b11f0439eeeddbbff0bf54856e922f5e1506a2f3098b5a808fcec4068b') add('SHA256_MISMATCH', 'pin');"),
  m('M09-status-case-insensitive', 'qualify.cjs', "if (found.status !== 'Valid') add(", "if (found.status.toLowerCase() !== 'valid') add("),
  m('M10-outer-timeout-never-fires', 'qualify.cjs', '    }, timeoutMs);', '    }, 2147483647);', 90),
  m('M11-multivalued-rdn-allowed', 'subject.cjs', "} else if (!quoted && ch === '+') {", '} else if (false) {'),
  m('M12-several-O-allowed', 'subject.cjs', "if (organizations.length > 1) return { ok: false, error: 'more than one organization (O) attribute' };", ''),
  m('M13-leading-zeros-allowed', 'version.cjs', "const PART = '(0|[1-9]\\\\d{0,4})';", "const PART = '(\\\\d{1,5})';"),
  m('M14-version-anchor-dropped', 'version.cjs', 'const VERSION = new RegExp(`^${PART}\\\\.${PART}\\\\.${PART}\\\\.${PART}$`);', 'const VERSION = new RegExp(`^${PART}\\\\.${PART}\\\\.${PART}\\\\.${PART}`);'),
  m('M15-qualified-strings-allowed', 'version.cjs', 'Number.isInteger(major) && major >= 1 && major <= MAX_PART', '!Number.isNaN(Number(major))'),
  m('M16-PSModulePath-not-dropped', 'adapters.cjs', 'const childEnv = { ...withoutKeys(env, /^PSModulePath$/i), [TARGET_VARIABLE]: target };', 'const childEnv = { ...env, [TARGET_VARIABLE]: target };'),
  m('M17-path-interpolated-into-script', 'adapters.cjs', 'answers.set(target, runShell({ shell, args: buildArgs(encoded), env: childEnv, timeoutMs }).then(decodeInspection));', "answers.set(target, runShell({ shell, args: buildArgs(Buffer.from((config.script || INSPECT_SCRIPT).replace('$env:QUALIFY_TARGET', `'${target}'`), 'utf16le').toString('base64')), env: childEnv, timeoutMs }).then(decodeInspection));"),
  m('M18-shell-timeout-removed', 'adapters.cjs', "      finish(reject, shellError('SHELL_TIMEOUT', `the shell did not answer within ${timeoutMs} ms and was ended`));", '      void 0;', 90),
  m('M19-shell-output-cap-removed', 'adapters.cjs', 'if (stdout.length > MAX_SHELL_OUTPUT) {', 'if (false) {', 90),
  m('M20-base64-check-dropped', 'adapters.cjs', "if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw shellError('INSPECT_OUTPUT_INVALID', 'the shell answer is not base64');", ''),
  m('M21-nonzero-shell-exit-accepted', 'adapters.cjs', 'if (code === 0) finish(resolve, stdout);', 'if (true) finish(resolve, stdout);'),
  m('M22-requalify-launches-on-any-blocker', 'requalify.cjs', 'if (blockers.length > 0) {', 'if (blockers.length > 99) {'),
  m('M23-version-mismatch-ignored', 'requalify.cjs', 'const passed = allSuitesPassed && !changed && mismatched.length === 0;', 'const passed = allSuitesPassed && !changed;'),
  m('M24-taskkill-tree-removed', 'requalify.cjs', "childProcess.spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });", 'void 0;'),
  m('M25-nested-env-not-scrubbed', 'requalify.cjs', "return { ...withoutKeys(env, /^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i), NODE_V8_COVERAGE: '' };", 'return { ...env };'),
  m('M26-zero-tests-counts-as-passed', 'requalify.cjs', 'facts.pass > 0 && ', ''),
  m('M27-json-overwrites', 'cli.cjs', "fs.writeFileSync(file, data, { flag: 'wx' })", "fs.writeFileSync(file, data, { flag: 'w' })"),
  m('M28-exit-0-on-failure', 'cli.cjs', 'let code = report.ok ? 0 : 1;', 'let code = 0;'),

  // F1: no BOM stripping or normalization anywhere in the subject parse path
  m('F1a-ignoreBOM-dropped', 'subject.cjs', "{ fatal: true, ignoreBOM: true }", '{ fatal: true }'),
  m('F1b-type-trimmed-with-unicode-whitespace', 'subject.cjs', "part.slice(0, equals).replace(/^[ \\t]+|[ \\t]+$/g, '')", 'part.slice(0, equals).trim()'),
  m('F1c-value-normalized-NFKC', 'subject.cjs', "ignoreBOM: true }).decode(Buffer.from(bytes)) };", "ignoreBOM: true }).decode(Buffer.from(bytes)).normalize('NFKC') };"),
  m('F1d-format-characters-stripped', 'subject.cjs', "ignoreBOM: true }).decode(Buffer.from(bytes)) };", "ignoreBOM: true }).decode(Buffer.from(bytes)).replace(/\\p{Cf}/gu, '') };"),
  m('F1e-value-lowercased', 'subject.cjs', "ignoreBOM: true }).decode(Buffer.from(bytes)) };", "ignoreBOM: true }).decode(Buffer.from(bytes)).toLowerCase() };"),

  // F2: a requalification must actually run its tests
  m('F2a-timeout-ignored', 'requalify.cjs', '!facts.timedOut && ', ''),
  m('F2b-spawn-error-ignored', 'requalify.cjs', 'facts.spawnError === null && ', ''),
  m('F2c-exit-code-ignored', 'requalify.cjs', 'facts.exitCode === 0 && ', ''),
  m('F2d-missing-summary-ignored', 'requalify.cjs', ' && facts.summaryFound', ''),
  m('F2e-pass-equals-tests-dropped', 'requalify.cjs', ' && facts.pass === facts.tests', ''),
  m('F2f-fail-ignored', 'requalify.cjs', 'facts.fail === 0 && ', ''),
  m('F2g-cancelled-ignored', 'requalify.cjs', 'facts.cancelled === 0 && ', ''),
  m('F2h-skipped-ignored', 'requalify.cjs', 'facts.skipped === 0 && ', ''),
  m('F2i-todo-ignored', 'requalify.cjs', ' && facts.todo === 0', ''),
  m('F2j-browser-line-not-needed-for-pass', 'requalify.cjs', 'passed: testsPassed && browserVersionsSeen.length > 0,', 'passed: testsPassed,'),
  m('F2k-missing-line-code-dropped', 'requalify.cjs', 'if (silentSuites.length > 0) {', 'if (false) {'),
  m('F2l-title-counts-as-sighting', 'requalify.cjs', '/^\\s*# Real Chromium (\\d+(?:\\.\\d+)+)/gm', '/Real Chromium (\\d+(?:\\.\\d+)+)/g'),
  m('F2m-no-suite-is-a-pass', 'requalify.cjs', "if (suites.length === 0) extra.push(['REQUALIFICATION_FAILED', 'no suite was run']);", 'if (false) extra.push([]);'),
  m('F2n-coverage-key-deleted-not-emptied', 'requalify.cjs', "return { ...withoutKeys(env, /^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i), NODE_V8_COVERAGE: '' };", 'return withoutKeys(env, /^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i);'),
  m('F2o-summary-needs-only-three-counters', 'requalify.cjs', "const SUMMARY_COUNTERS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];", "const SUMMARY_COUNTERS = ['tests', 'pass', 'fail'];"),

  // F3: one stderr line
  m('F3a-whitespace-not-collapsed', 'cli.cjs', "const oneLine = (text) => String(text).replace(/\\s+/g, ' ').trim();", 'const oneLine = (text) => String(text);'),
  m('F3b-same-text-not-grouped', 'cli.cjs', 'const codes = groups.get(message) || [];', 'const codes = [];'),
  m('F3c-duplicate-codes-kept', 'cli.cjs', "if (code !== '' && !codes.includes(code)) codes.push(code);", "if (code !== '') codes.push(code);"),
  m('F3d-write-error-second-line', 'cli.cjs', 'line = `${line} | cannot write ${options.json}: ${oneLine(error.message)}`;', "err.write(`cannot write ${options.json}: ${error.message}\\n`);"),
  m('F3e-write-failure-exit-code', 'cli.cjs', '      code = 2;', '      code = 1;'),

  // F4: the digest is read again and both reads must agree
  m('F4a-second-read-dropped', 'qualify.cjs', 'if (report.sha256 !== null) {', 'if (false) {'),
  m('F4b-digest-comparison-dropped', 'qualify.cjs', '} else if (again.value.toLowerCase() !== first) {', '} else if (false) {'),
  m('F4c-digest-comparison-case-sensitive', 'qualify.cjs', '} else if (again.value.toLowerCase() !== first) {', '} else if (again.value !== first) {'),
  m('F4d-second-read-error-ignored', 'qualify.cjs', 'if (again.error) {', 'if (false) {'),
  m('F4e-second-read-garbage-accepted', 'qualify.cjs', "} else if (typeof again.value !== 'string' || !DIGEST.test(again.value)) {", '} else if (false) {'),
  m('F4f-changed-finding-not-deduplicated', 'qualify.cjs', "if (!changed) add('EDGE_CHANGED_DURING_CHECK',", "add('EDGE_CHANGED_DURING_CHECK',"),

  // F6: the --json target is checked before anything runs
  m('F6a-empty-target-accepted', 'cli.cjs', "if (target === '') return 'it is empty';", ''),
  m('F6b-control-characters-accepted', 'cli.cjs', "if (/[\\u0000-\\u001F<>\"|?*]/.test(target)) return 'it contains a control or wildcard character';", ''),
  m('F6c-unc-paths-accepted', 'cli.cjs', "if (/^[\\\\/]{2}/.test(target)) return 'UNC and device paths are not allowed';", ''),
  m('F6d-colon-accepted', 'cli.cjs', "if (rest.includes(':')) return 'a colon after the drive letter would address an alternate data stream';", ''),
  m('F6e-drive-letter-not-recognized', 'cli.cjs', "const rest = /^[A-Za-z]:/.test(target) ? target.slice(2) : target;", 'const rest = target;'),
  m('F6f-trailing-dot-or-space-accepted', 'cli.cjs', "if (/[. ]$/.test(segment)) return `the name ${JSON.stringify(segment)} ends with a dot or a space`;", ''),
  m('F6g-reserved-names-accepted', 'cli.cjs', 'if (RESERVED_NAME.test(segment.split(\'.\')[0].replace(/ +$/, \'\'))) return', 'if (false) return'),
  m('F6h-navigation-segments-refused', 'cli.cjs', "if (segment === '' || segment === '.' || segment === '..') continue;", ''),
  m('F6i-existing-target-accepted', 'cli.cjs', 'return `cannot write ${quoted}: the file already exists, --json never overwrites`;', 'return null;'),
  m('F6j-missing-folder-accepted', 'cli.cjs', 'return `invalid --json target ${quoted}: the folder does not exist`;', 'return null;'),
  m('F6k-check-after-the-run', 'cli.cjs', 'const problem = checkJsonTarget(options.json, io.fs || fs);', "const problem = options.requalify ? null : checkJsonTarget(options.json, io.fs || fs);"),
];

module.exports = { MUTANTS };
