'use strict';

const { spawnSync } = require('node:child_process');

function childEnvironment(source = process.env) {
  return { ...source };
}
function runNodeTest(file, options = {}) {
  return spawnSync(process.execPath, ['--test', file], {
    timeout: 15000, windowsHide: true, encoding: 'utf8', ...options, env: childEnvironment(options.env)
  });
}
module.exports = Object.freeze({ childEnvironment, runNodeTest });
