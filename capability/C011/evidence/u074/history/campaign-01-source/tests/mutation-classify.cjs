'use strict';

function classify(text) {
  const blocks = text.split(/^(?=\s*(?:not )?ok \d+ - )/m).filter((block) => /^\s*not ok \d+ - /.test(block));
  const killedBy = [];
  const rejected = [];
  for (const block of blocks) {
    const title = /^\s*not ok \d+ - (.+)$/m.exec(block)[1].trim();
    const reason = /testTimeoutFailure|cancelledByParent|ERR_TEST_TIMEOUT|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError/.test(block)
      || /[\\/]capability[\\/]|\.test\.cjs$/.test(title)
      || !/failureType: 'testCodeFailure'/.test(block)
      || !/(?:code: 'ERR_ASSERTION'|error: .*MUTANT_LOOP_BOUND)/.test(block);
    if (reason) rejected.push(title);
    else killedBy.push(title);
  }
  return { killedBy: [...new Set(killedBy)], rejected: [...new Set(rejected)] };
}

module.exports = Object.freeze({ classify });
