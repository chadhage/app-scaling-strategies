'use strict';

// Test tooling, not production code: a disposable server PROCESS for the pipelining matrix. Each {type:'open', code} starts the real
// createApp on 127.0.0.1 port 0 with the setup of that refusal row applied (one app per row, all in this one process, so the matrix
// costs one process start and not one per row) and answers {type:'opened:<code>', port, tokens, extra}. {type:'state', code} answers
// {type:'state:<code>', revision, size, applied} (applied audit records). 'close' ends the process. It sends {type:'ready'} first.
const { send, startApp } = require('./helpers.cjs');
const { ROWS } = require('./refusal-rows.cjs');
const { appFor, appliedCount } = require('./pipeline-rows.cjs');

const NAMES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const contexts = new Map();

async function open(code) {
  const row = ROWS.find((entry) => entry.code === code);
  const context = await startApp({ app: appFor(row) });
  const tokens = Object.fromEntries(NAMES.map((name) => [name, context.app.issueToken(name)]));
  const extra = (await row.setup?.({ context, tokens, send })) || {};
  contexts.set(code, context);
  process.send({ type: `opened:${code}`, port: context.port, tokens, extra });
}

process.on('message', (message) => {
  if (message.type === 'open') {
    open(message.code);
  } else if (message.type === 'state') {
    const context = contexts.get(message.code);
    const { revision, state } = context.app.snapshot();
    process.send({ type: `state:${message.code}`, revision, size: state.pool.size, applied: appliedCount(context) });
  } else if (message === 'close') {
    Promise.all([...contexts.values()].map((context) => context.close())).then(() => process.exit(0));
  }
});
process.send({ type: 'ready' });
