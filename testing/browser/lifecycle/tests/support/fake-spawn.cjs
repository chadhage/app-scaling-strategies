'use strict';

const { EventEmitter } = require('node:events');

// A fake child_process.spawn for the hermetic adapter tests: records the command, arguments, options and everything
// written to standard input, then lets the test script what the "PowerShell helper" prints.
function fakeSpawn(behave) {
  const calls = [];
  function spawn(command, args, options) {
    if (behave.throws) throw behave.throws;
    const child = new EventEmitter();
    const call = { command, args, options, stdin: '', killed: 0, child };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = (text) => { call.stdin += String(text); };
    child.kill = () => { call.killed += 1; return true; };
    calls.push(call);
    setImmediate(() => behave.run && behave.run(child, call));
    return child;
  }
  spawn.calls = calls;
  return spawn;
}

const succeed = (stdout) => (child) => {
  child.stdout.emit('data', Buffer.from(stdout));
  child.emit('close', 0);
};

module.exports = { fakeSpawn, succeed };
