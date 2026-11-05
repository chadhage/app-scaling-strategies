'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');

function packageReleases(directory, epoch, commit) {
  const files = {};
  const add = (file, archivePath) => { files[archivePath] = new Uint8Array(fs.readFileSync(file)); };
  for (const file of ['app.cjs', 'server.cjs', 'package.json', 'package-lock.json', 'lib/contract.cjs', 'lib/store.cjs']) {
    add(path.join(__dirname, file), file);
  }
  const visit = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['.bin', '.cache', '.package-lock.json'].includes(entry.name)) continue;
      const name = `${prefix}/${entry.name}`;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file, name);
      else if (entry.isFile()) add(file, name);
      else throw new Error(`Unsupported package entry: ${name}`);
    }
  };
  visit(path.join(__dirname, 'node_modules'), 'node_modules');
  fs.mkdirSync(directory, { recursive: true });
  for (const version of ['blue', 'green', 'router']) {
    const release = Buffer.from(JSON.stringify({ version, epoch, commit }));
    fs.writeFileSync(path.join(directory, `${version}.zip`), zipSync({ ...files, 'release.json': release }, { level: 6 }));
  }
}

module.exports = { packageReleases };
