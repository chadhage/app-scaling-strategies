'use strict';

function parsePublishedOutput(text) {
  if (arguments.length !== 1 || typeof text !== 'string' || Buffer.byteLength(text) > 16 * 1024 * 1024) {
    throw new Error('Bounded actual publisher stdout required.');
  }
  const roots = [...text.matchAll(/(?:^|\r?\n)\{[ \t]*\r?\n[ \t]*"cardId"\s*:/g)];
  const last = roots.at(-1);
  const candidate = last ? text.slice(last.index + last[0].indexOf('{')) : text;
  const result = JSON.parse(candidate);
  if (result.cardId !== 'C029' || result.workerId !== 'worker-C029' || result.outcome !== 'published' ||
      !/^[0-9a-f]{40}$/.test(result.commit) || result.tag !== `kanban/C029/${result.commit.slice(0, 12)}` ||
      result.publication?.remoteVerified !== true || result.proof?.ownedOnlyCommit !== true ||
      result.proof?.remotePeeledTag !== result.commit) throw new Error('Exact actual guarded publication result required.');
  return result;
}
module.exports = Object.freeze({ parsePublishedOutput });
