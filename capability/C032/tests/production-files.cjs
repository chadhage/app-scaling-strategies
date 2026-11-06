'use strict';

// Test tooling, not production code: the ENUMERATED production set the coverage gate measures.
// Node reports only loaded files, so the set is listed from the namespace itself and an unloaded file counts as 0%.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
// index.html and style.css are markup and styling, which Node coverage cannot measure; they are disclosed, never counted.
const NOT_NODE_MEASURABLE = Object.freeze(['index.html', 'style.css']);

function enumerate(directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.c?js$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

module.exports = Object.freeze({ root, NOT_NODE_MEASURABLE, enumerate });
