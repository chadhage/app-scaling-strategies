'use strict';

// The CONTROL of the step-count tests: a plain recursive backtracking matcher with the same glob semantics as glob.cjs (* inside one segment, ** across
// segments, **/ an optional group that ends with a separator, ? one character but a separator). It counts its recursive calls, so its cost can be compared
// with the steps of the linear matcher in the same test without a clock, and it gives up at a budget instead of running for hours.
const EXHAUSTED = Symbol('budget exhausted');

function naiveMatch(pattern, input, budget = 1000000) {
  let calls = 0;
  const walk = (at, from) => {
    calls += 1;
    if (calls > budget) throw EXHAUSTED;
    if (at === pattern.length) return from === input.length;
    const character = pattern[at];
    if (character === '*' && pattern[at + 1] === '*') {
      if (pattern[at + 2] === '/') {
        if (walk(at + 3, from)) return true;
        for (let end = from; end < input.length; end += 1) {
          if (input[end] === '/' && walk(at + 3, end + 1)) return true;
        }
        return false;
      }
      for (let end = from; end <= input.length; end += 1) {
        if (walk(at + 2, end)) return true;
      }
      return false;
    }
    if (character === '*') {
      for (let end = from; end <= input.length; end += 1) {
        if (walk(at + 1, end)) return true;
        if (input[end] === '/') break;
      }
      return false;
    }
    if (character === '?') return from < input.length && input[from] !== '/' && walk(at + 1, from + 1);
    return from < input.length && input[from] === character && walk(at + 1, from + 1);
  };
  try {
    return { matched: walk(0, 0), calls, exhausted: false };
  } catch (error) {
    if (error !== EXHAUSTED) throw error;
    return { matched: null, calls, exhausted: true };
  }
}

module.exports = Object.freeze({ naiveMatch });
