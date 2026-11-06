'use strict';

// Fixture suite for the requalification runner: starts a DETACHED grandchild (detached processes are not in the job object
// that ends ordinary children together with their parent), records its PID and then never ends.
// The grandchild ends itself after 30 s so that a missing tree kill never leaves a process behind.
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', detached: true, windowsHide: true });
child.unref();
fs.writeFileSync(process.env.FIXTURE_PID_FILE, String(child.pid));
setInterval(() => {}, 1000);
