'use strict';

function classify(value) {
  if (value > 0) {
    return 'positive';
  }
  return 'non-positive';
}

module.exports = { classify };
