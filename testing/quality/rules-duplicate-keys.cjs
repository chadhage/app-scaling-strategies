'use strict';

const { findDuplicateJsonKeys } = require('./json-token-reader.cjs');

const CODES = ['DUPLICATE_JSON_KEY'];

function checkDuplicateKeys(packet, add, rawJsonText) {
  for (const finding of findDuplicateJsonKeys(rawJsonText)) {
    add(finding.code, finding.path, finding.message);
  }
}

module.exports = { CODES, checkDuplicateKeys };
