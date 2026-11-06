'use strict';

// Fixture suite for the requalification runner: starts a grandchild, records its PID and then never ends.
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(process.env.FIXTURE_PID_FILE, String(child.pid));
setInterval(() => {}, 1000);
