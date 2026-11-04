'use strict';

const fs = require('node:fs');
const path = require('node:path');

function captureEnabled(value) {
  return value === '1';
}

function captureBrowserEvidence(report) {
  if (!captureEnabled(process.env.CAPTURE_BROWSER_EVIDENCE)) return false;
  const bytes = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(path.join(__dirname, 'evidence', 'browser.json'), bytes);
  fs.writeFileSync(path.join(__dirname, 'evidence', 'raw', 'browser-observation.json'), bytes);
  return true;
}

module.exports = { captureEnabled, captureBrowserEvidence };
