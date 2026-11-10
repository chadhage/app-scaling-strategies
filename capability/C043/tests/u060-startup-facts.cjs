'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function publish(file, fact) {
  const pending = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.pending`);
  let collision = false;
  try {
    try { fs.writeFileSync(pending, JSON.stringify(fact), { flag: 'wx' }); }
    catch (error) { collision = error.code === 'EEXIST'; throw error; }
    fs.linkSync(pending, file);
  } finally {
    if (!collision && fs.existsSync(pending)) fs.unlinkSync(pending);
  }
}

module.exports = Object.freeze({ publish });
