'use strict';

const { readCurrent } = require('./current.cjs');
async function stdin(maximum) {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > maximum) throw Object.assign(new Error('BOUNDED_STDIN_REQUIRED'), { code: 'BOUNDED_STDIN_REQUIRED' });
    chunks.push(chunk);
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw Object.assign(new Error('INVALID_UTF8'), { code: 'INVALID_UTF8' }); }
}
async function main() {
  const args = process.argv.slice(2);
  const unary = ['reset', 'context', 'session'];
  const binary = ['inspect', 'inspect-copy', 'copy', 'compare'];
  if (!(args.length === 1 && unary.includes(args[0]) || args.length === 2 && binary.includes(args[0]))) {
    throw Object.assign(new Error('CLOSED_CLI_ARGUMENTS_REQUIRED'), { code: 'CLOSED_CLI_ARGUMENTS_REQUIRED' });
  }
  const currentContext = await readCurrent();
  const classifier = require('./classifier.js');
  if (args[0] === 'copy') {
    process.stdout.write(`${await classifier.sourceJson(args[1])}\n`);
    return;
  }
  const session = classifier.createSession();
  let state;
  if (args[0] === 'session') {
    const text = await stdin(classifier.MAX_BYTES * classifier.MAX_HISTORY);
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    if (!lines.length || lines.length > classifier.MAX_HISTORY + 2) {
      throw Object.assign(new Error('BOUNDED_SESSION_COMMANDS_REQUIRED'), { code: 'BOUNDED_SESSION_COMMANDS_REQUIRED' });
    }
    for (const line of lines) state = await session.apply(line);
  } else if (args[0] === 'inspect-copy') {
    state = await session.apply({ type: 'inspect-copy', id: args[1], text: await stdin(classifier.MAX_BYTES * 2) });
  } else if (args[0] === 'context') state = session.snapshot();
  else state = await session.apply(args.length === 2 ? { type: args[0], id: args[1] } : { type: 'reset' });
  console.log(JSON.stringify({
    schema: 'C035-cli/1', trainingBanner: classifier.banner,
    mode: 'Actual current Node C015 public restore, read-only; classified historical sources and MODELED controls remain separate.',
    currentContext, session: state, IaC: 'N/A', extraKanoCredits: 0,
    parentsCompleted: false, nativeAuthority: false, productionNode24Validated: false
  }, null, 2));
  if (args[0] === 'context') return;
  process.exitCode = state.error || state.history.some((entry) => !entry.result.valid) ? 3 :
    state.retainedDecision === 'FAIL' ? 1 : state.retainedDecision === 'HOLD' ? 2 : 0;
}
main().catch((error) => {
  console.log(JSON.stringify({
    schema: 'C035-cli-rejection/1', valid: false, decision: 'HOLD',
    code: error.code || 'LOCAL_SOURCE_OR_CONTEXT_UNAVAILABLE',
    trainingBanner: 'Training rehearsal - synthetic data - not a live Azure result',
    actualUserMutationSuccess: false, candidateAdopted: false,
    actualCancellationPerformed: false, cleanupPerformed: false,
    meaning: 'No silent context/source fallback, work mutation, cancellation, cleanup or undo.'
  }));
  process.exitCode = 3;
});
