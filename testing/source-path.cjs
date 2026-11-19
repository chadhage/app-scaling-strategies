'use strict';

const path = require('node:path');

// Keep recorded source names intact while locating their current working files.
function workingSourcePath(repository, recordedPath) {
  const parts = recordedPath.split(/[/\\]/);
  if (parts[0] === '.docs' && parts[1] === 'wiki') parts[0] = 'meta';
  if (parts[0] === '.azure' && parts[1] === 'deployment-plan.md') parts[0] = 'meta';
  return path.join(repository, ...parts);
}

module.exports = { workingSourcePath };
