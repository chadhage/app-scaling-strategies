'use strict';

// Fault injection for the command-line tests (test tooling, loaded with --require): the FIRST write to every stream named in
// FAULT_STREAMS (default: stdout) throws, the way a broken stream does inside main(), outside the check's own try/catch.
for (const name of (process.env.FAULT_STREAMS || 'stdout').split(',')) {
  const stream = process[name];
  const original = stream.write.bind(stream);
  let thrown = false;
  stream.write = function write(...args) {
    if (!thrown) {
      thrown = true;
      throw new Error(`injected: ${name} is broken`);
    }
    return original(...args);
  };
}
