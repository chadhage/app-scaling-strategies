'use strict';

const fs = require('node:fs');
const { validateAuthorization } = require('..\\publisher-policy.cjs');
try {
  if (process.argv.length !== 2) throw new Error('No authorization arguments supported.');
  const text = fs.readFileSync(0, 'utf8');
  if (Buffer.byteLength(text) > 16384) throw new Error('Bounded canonical authorization required.');
  console.log(JSON.stringify(validateAuthorization(text)));
} catch (error) {
  console.error(JSON.stringify({ allowed: false, code: error.code || 'PUBLICATION_AUTHORIZATION_UNAVAILABLE' }));
  process.exitCode = 1;
}
