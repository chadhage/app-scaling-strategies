'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const lessonRoot = path.resolve(__dirname, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assetNames = ['index.html', 'lesson.css', 'fixtures.js', 'model.js', 'app.js'];

function shouldCapture(value) {
  return value === '1';
}

function assetHashes() {
  return Object.fromEntries(assetNames.map((name) => [name, sha256(fs.readFileSync(path.join(lessonRoot, name)))]));
}

function captureBrowser(evidence) {
  if (!shouldCapture(process.env.CAPTURE_BROWSER_EVIDENCE)) return null;
  const root = path.join(lessonRoot, 'evidence', 'browser');
  const id = randomUUID();
  const rawRelative = path.join('evidence', 'raw', 'served-assets', id);
  const rawRoot = path.join(lessonRoot, rawRelative);
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(rawRoot, { recursive: true });
  const servedAssetSnapshots = {};
  for (const name of assetNames) {
    const bytes = fs.readFileSync(path.join(lessonRoot, name));
    const relative = path.join(rawRelative, `${name}.snapshot`);
    fs.writeFileSync(path.join(lessonRoot, relative), bytes, { flag: 'wx' });
    servedAssetSnapshots[name] = { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const target = path.join(root, `browser-${id}.json`);
  fs.writeFileSync(target, JSON.stringify({
    ...evidence,
    schema: 'S147/browser-evidence-v1',
    capturedAtUtc: new Date().toISOString(),
    assets: Object.fromEntries(Object.entries(servedAssetSnapshots).map(([name, entry]) => [name, entry.sha256])),
    servedAssetSnapshots,
  }, null, 2) + '\n', { flag: 'wx' });
  return target;
}

module.exports = { shouldCapture, captureBrowser, assetHashes, sha256 };
