'use strict';
const { group } = require('./resource-group.cjs');
const { remaining } = require('./budget.cjs');
let busy = false;
process.on('message', async message => {
  if (message?.kind === 'stop') { process.disconnect(); return; }
  if (message?.kind !== 'job' || busy || !Number.isInteger(message.id)) throw new Error('Closed serial resource job protocol');
  busy = true;
  let watchdog;
  try {
    remaining(60000);
    const result = await Promise.race([group(message.id), new Promise((resolve, reject) => {
      watchdog = setTimeout(() => reject(Object.assign(new Error('Resource job watchdog is NONPASS, not timing qualification'), { code: 'C012_JOB_WATCHDOG' })), Math.min(remaining(60000), 120000));
    })]);
    process.stdout.write(JSON.stringify({ kind: 'resource-group', ...result }) + '\n');
    process.send({ kind: 'result', ...result });
  } catch (error) {
    const failure = { kind: 'failure', job: message.id, name: error.name, code: error.code || null, message: error.message, stack: error.stack };
    process.stderr.write(JSON.stringify(failure) + '\n'); process.send(failure);
  } finally { clearTimeout(watchdog); busy = false; }
});
process.send({ kind: 'ready', pid: process.pid, noHeavyWorkBeforeParentBirthJournal: true });
