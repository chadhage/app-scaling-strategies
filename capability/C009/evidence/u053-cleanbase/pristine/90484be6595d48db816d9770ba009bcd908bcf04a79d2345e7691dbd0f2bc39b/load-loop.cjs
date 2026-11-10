'use strict';

// Test tooling, not production code: runs ONE node command under N CPU burners that this script starts itself and stops by PID (never by
// name), the load of review finding F9c. Usage:
//   node capability\C009\tests\load-loop.cjs <burners> <node arguments...>
// for example the 8-way flake loop of one test file under 8 burners (8 parallel runs, 8 rounds, each run under the 60 s of the runner):
//   node capability\C009\tests\load-loop.cjs 8 capability\C009\tests\flake-loop.cjs . refusal-flood.test.cjs 8 8
// or the whole suite under 8 burners:
//   node capability\C009\tests\load-loop.cjs 8 --test --test-timeout=60000 --test-concurrency=1 "capability/C009/tests/*.test.cjs"
// A burner is a node process that spins until it is stopped (or for 40 minutes at the most, if this script dies); the burners run at NORMAL
// priority on purpose (they emulate a machine under load: a BelowNormal process gets 2 to 4 percent of a core on a saturated machine). The
// PIDs of the burners are printed when they start and when they are stopped; the command's output and exit code pass through. Take a
// heavy slot (RUN\scripts\heavy-slot.ps1) first: 8 burners and 8 parallel runs load the whole machine.
const { spawn } = require('node:child_process');

const [count, ...args] = process.argv.slice(2);
const burners = Number(count);
if (!Number.isInteger(burners) || burners < 0 || burners > 16 || args.length === 0) throw new Error('Usage: node load-loop.cjs <burners 0 to 16> <node arguments...>');

const pids = [];
const stopAll = () => {
  for (const pid of pids.splice(0)) {
    try { process.kill(pid); } catch { /* already gone */ }
  }
};
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopAll(); process.exit(130); });

const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
delete environment.NODE_V8_COVERAGE;
for (let index = 0; index < burners; index += 1) {
  const burner = spawn(process.execPath, ['-e', 'const end=Date.now()+2400000;while(Date.now()<end){}'], { stdio: 'ignore', windowsHide: true });
  pids.push(burner.pid);
}
const started = [...pids];
console.log(`LOAD ${burners} burners started at ${new Date().toISOString()}, PIDs ${started.join(',')}`);

setTimeout(() => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: environment, windowsHide: true });
  child.on('close', (code) => {
    stopAll();
    console.log(`LOAD ${burners} burners stopped by PID at ${new Date().toISOString()}, PIDs ${started.join(',')}`);
    process.exit(code === null ? 1 : code);
  });
}, 2000);
