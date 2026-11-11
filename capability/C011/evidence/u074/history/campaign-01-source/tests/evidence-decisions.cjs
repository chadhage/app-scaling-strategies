'use strict';
const { classify } = require('./mutation-classify.cjs');
const { summaryOf, sha } = require('./evidence-verify.cjs');
const PRODUCTION = ['codes.cjs', 'config.cjs', 'contract.js', 'json.cjs', 'page.js', 'server.cjs', 'store.cjs'];
const REQUIRED = ['final-core', 'final-guard-replay', 'final-red-replay', 'final-coverage', 'final-browser', 'final-loop',
  'final-mutations', 'final-fresh-lf', 'final-fresh-crlf', 'final-source-git'];

function decide(verified) {
  const problems = [];
  const add = (kind) => problems.push(kind);
  for (const name of REQUIRED) {
    const record = verified.records.get(name);
    if (!record || record.execution.exitCode !== 0 || record.execution.expectedExitCode !== 0) add('REQUIRED_CURRENT_CAPTURE_MISSING_OR_FAILED:' + name);
  }
  const core = verified.records.get('final-core');
  if (!core || core.summary.tests <= 0 || core.summary.pass !== core.summary.tests
      || ['fail', 'cancelled', 'skipped', 'todo'].some((key) => core.summary[key] !== 0)) add('WHOLE_CORE_NOT_GREEN');
  if (core) {
    try {
      const observed = JSON.parse(/C011_ASSERTIONS (.+)$/m.exec(core.stdout)[1]);
      if (observed.tests !== core.summary.tests || observed.declared !== observed.tests || observed.assertions <= 0 || observed.zeroAssertionTests.length) add('ASSERTION_COUNTS_INCOMPLETE');
    } catch { add('ASSERTION_COUNTS_MISSING'); }
  }
  const red = verified.records.get('cancellation-red-02');
  const green = verified.records.get('final-guard-replay');
  if (!red || red.summary.tests !== 6 || red.summary.fail !== 2 || red.summary.pass !== 4
      || red.execution.exitCode !== 1 || classify(red.stdout).killedBy.length !== 2) add('GENUINE_CONTINUATION_RED_MISSING');
  if (!green || green.summary.tests !== 9 || green.summary.pass !== 9 || green.summary.fail !== 0) add('UNCHANGED_RED_REPLAY_MISSING');
  if (red && green) {
    const test = (record) => record.inputs.find((input) => input.path.endsWith('/tests/cancellation-final.test.cjs'))?.rawSha256;
    if (!test(red) || test(red) !== test(green)) add('RED_TESTS_CHANGED');
  }
  const configurationRed = verified.records.get('config-red-01');
  if (!configurationRed || configurationRed.summary.tests !== 3 || configurationRed.summary.fail !== 3
      || configurationRed.execution.exitCode !== 1 || classify(configurationRed.stdout).killedBy.length !== 3) add('GENUINE_CONFIGURATION_RED_MISSING');
  if (configurationRed && green) {
    const test = (record) => record.inputs.find((input) => input.path.endsWith('/tests/config-final.test.cjs'))?.rawSha256;
    if (!test(configurationRed) || test(configurationRed) !== test(green)) add('CONFIGURATION_RED_TESTS_CHANGED');
  }
  const replay = verified.records.get('final-red-replay');
  if (!replay || replay.summary.tests !== 71 || replay.summary.pass !== 71 || replay.summary.fail !== 0) add('ORIGINAL_BEHAVIOR_REPLAY_NOT_GREEN');

  const coverage = verified.data.get('coverage');
  if (!coverage || JSON.stringify(coverage.files?.map((row) => row.file).sort()) !== JSON.stringify([...PRODUCTION].sort())
      || coverage.unenumerated?.length || coverage.missing?.length || !coverage.passed) add('WHOLE_FILE_COVERAGE_SET_INCOMPLETE');
  if (coverage) for (const row of coverage.files || []) {
    if (!row.loaded || row.nestedExit !== 0 || row.lines < 85 || row.branches < 85 || row.functions < 85 || row.failures.length) add('COVERAGE_BELOW_85:' + row.file);
  }
  const browser = verified.data.get('browser');
  if (!browser || browser.browser?.signature !== 'Valid' || browser.browser?.publisher !== 'Microsoft Corporation'
      || browser.browser?.major !== 157 || browser.observations?.length !== 2) add('REAL_QUALIFIED_BROWSER_MISSING');
  if (browser) {
    for (const entry of browser.observations || []) {
      if (!entry.cleanup?.clean || entry.cleanup.absentProfileCount !== 1 || entry.cleanup.absentScratchCount !== 1
          || entry.cleanup.absentCreatedDirectoryCount !== 2 || entry.cleanup.ownedNativeIdentities.length < 1) add('BROWSER_OWN_CLEANUP_UNPROVEN');
      if (entry.label === 'success') for (const view of [entry.first, entry.second]) {
        if (view.rows.length !== 21 || view.outcomes.filter((value) => value === 'allowed').length !== 12
            || view.outcomes.filter((value) => value === 'forbidden').length !== 9 || view.balanced !== 'yes'
            || new Set(view.ids).size !== view.ids.length || !view.rowVisibility.every(Boolean)) add('BROWSER_RENDERED_INVARIANT_FAILED');
      }
      if (entry.label === 'injected-failure' && !entry.failureCaught) add('INJECTED_BROWSER_FAILURE_NOT_EXECUTED');
    }
  }
  const loop = verified.data.get('loop');
  if (!loop || !loop.passed || loop.completed !== 80 || loop.bad !== 0 || loop.rounds !== 20 || loop.concurrency !== 4
      || loop.burners?.length !== 4 || loop.burners.some((burner) => !burner.stopped)) add('LOAD_LOOP_INCOMPLETE');
  if (loop) for (const run of loop.runs || []) {
    try {
      const out = verified.projection(run.streams.stdout.publicProjection);
      verified.projection(run.streams.stderr.publicProjection);
      const actual = summaryOf(out);
      if (JSON.stringify(actual) !== JSON.stringify({ ...actual, ...run.summary }) || run.code !== 0 || run.signal || run.timedOut
          || actual.tests <= 0 || actual.pass !== actual.tests || actual.fail || actual.cancelled || actual.skipped || actual.todo) add('LOAD_REPETITION_FAILED:' + run.index);
    } catch { add('LOAD_STREAM_UNREADABLE:' + run.index); }
  }
  const mutation = verified.data.get('mutation');
  const definitions = verified.data.get('mutation-definitions');
  if (!mutation || !definitions || mutation.generated !== definitions.length || mutation.executed !== definitions.length
      || mutation.notExecuted !== 0 || mutation.survived !== 0 || mutation.undecidedCount !== 0
      || mutation.equivalent !== 0 || mutation.killed !== definitions.length || mutation.entries.length !== definitions.length) add('MUTATION_CAMPAIGN_INCOMPLETE');
  if (mutation && definitions) {
    const variants = new Map(definitions.map((entry) => [entry.file + ': ' + entry.label, entry]));
    for (const entry of mutation.entries) {
      const definition = variants.get(entry.file + ': ' + entry.label);
      if (!definition || definition.sourceSha256 !== entry.sourceSha256 || definition.mutantSha256 !== entry.mutantSha256
          || definition.executedSha256 !== entry.executedSha256) add('MUTANT_IDENTITY_DIFFERS:' + entry.label);
      let witnessed = false;
      for (const run of entry.observations || []) {
        try {
          const text = verified.projection(run.streams.stdout.publicProjection) + verified.projection(run.streams.stderr.publicProjection);
          if (run.code !== 0 && !run.signal && !run.timedOut
              && classify(text).killedBy.some((name) => entry.failingTests.includes(name))) witnessed = true;
        } catch { add('MUTANT_STREAM_UNREADABLE:' + entry.label); }
      }
      if (!entry.killed || entry.undecided || !witnessed) add('NO_GENUINE_NAMED_KILL:' + entry.label);
    }
  }
  for (const mode of ['lf', 'crlf']) {
    const fresh = verified.data.get('fresh-' + mode);
    if (!fresh || fresh.mode !== mode || fresh.code !== 0 || fresh.signal || fresh.spawnError
        || fresh.summary.pass !== fresh.summary.tests || fresh.summary.tests <= 0
        || fresh.summary.fail || fresh.summary.cancelled || fresh.summary.skipped || fresh.assertions?.zeroAssertionTests.length) add('FRESH_NAMESPACE_FAILED:' + mode);
  }
  const source = verified.data.get('source-git');
  if (!source || !source.passed || !source.frozenSourceMatches || !source.inheritedLiveBytesUnchanged
      || !source.currentAcceptedDependenciesMatch || !Array.isArray(source.consumers)) add('SOURCE_GIT_CONSUMER_GATE_MISSING');
  return problems;
}
module.exports = Object.freeze({ decide, PRODUCTION, REQUIRED });
