'use strict';

const { UsageError } = require('./errors.cjs');

// Only * (inside one path segment), ** (across segments) and ? (one character) are glob syntax here; patterns always use / separators.
// Every other glob character is refused instead of being guessed, so a pattern never silently means something else.
const REFUSED = /[[\]{}()!]/;
// The matcher is linear in the pattern times the path, so a bounded pattern bounds the work of every match.
const MAX_PATTERN_LENGTH = 1024;

function normalizePattern(pattern) {
  return String(pattern).replace(/\\/g, '/');
}

function hasMagic(pattern) {
  return /[*?]/.test(pattern);
}

const LITERAL = 0;
const ONE_CHARACTER = 1;
const SEGMENT_RUN = 2;
const ANY_RUN = 3;
const GROUP_ENTRY = 4;

// * is SEGMENT_RUN (any run inside one path segment), ** is ANY_RUN (any run, separators included), ? is ONE_CHARACTER (one character but a separator) and
// everything else is a literal. **/ is the optional group "any run, then a separator": GROUP_ENTRY, ANY_RUN and the literal /; GROUP_ENTRY can jump over all three.
function tokenize(text) {
  const kinds = [];
  const characters = [];
  const push = (kind, character = '') => {
    kinds.push(kind);
    characters.push(character);
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '*') {
      if (text[index + 1] === '*') {
        if (text[index + 2] === '/') {
          push(GROUP_ENTRY);
          push(ANY_RUN);
          push(LITERAL, '/');
          index += 2;
        } else {
          push(ANY_RUN);
          index += 1;
        }
      } else {
        push(SEGMENT_RUN);
      }
    } else if (character === '?') {
      push(ONE_CHARACTER);
    } else {
      push(LITERAL, character);
    }
  }
  return { kinds, characters };
}

// Adds every state that can be reached without consuming a character. The edges only go forward, so one ascending pass is the whole closure.
// It returns what the pass cost: one step per state of the token table.
function close(marks, kinds) {
  let steps = 0;
  for (let state = 0; state < kinds.length; state += 1) {
    steps += 1;
    if (marks[state] === 1) {
      const kind = kinds[state];
      if (kind === SEGMENT_RUN || kind === ANY_RUN) {
        marks[state + 1] = 1;
      } else if (kind === GROUP_ENTRY) {
        marks[state + 1] = 1;
        marks[state + 3] = 1;
      }
    }
  }
  return steps;
}

// Simulates the pattern as a non-deterministic automaton over the path: one pass over the characters, at most one step per token and character.
// The work is bounded by the length of the pattern times the length of the path; nothing backtracks, so no input can make it explode.
// It also reports its STEPS, so that the bound can be checked without a clock (N1 of the second review): one closure of the token table before the first
// character, then one scan and one closure per character that is read. A name that leaves no live state stops the loop at once.
function run({ kinds, characters }, input) {
  const count = kinds.length;
  let active = new Uint8Array(count + 1);
  let following = new Uint8Array(count + 1);
  let consumed = 0;
  active[0] = 1;
  let steps = close(active, kinds);
  for (let position = 0; position < input.length; position += 1) {
    const character = input[position];
    const separator = character === '/';
    consumed += 1;
    following.fill(0);
    let alive = false;
    for (let state = 0; state < count; state += 1) {
      steps += 1;
      if (active[state] === 1) {
        const kind = kinds[state];
        if (kind === LITERAL) {
          if (characters[state] === character) {
            following[state + 1] = 1;
            alive = true;
          }
        } else if (kind === ONE_CHARACTER) {
          if (!separator) {
            following[state + 1] = 1;
            alive = true;
          }
        } else if (kind === SEGMENT_RUN) {
          if (!separator) {
            following[state] = 1;
            alive = true;
          }
        } else if (kind === ANY_RUN) {
          following[state] = 1;
          alive = true;
        }
      }
    }
    if (!alive) return { matched: false, steps, consumed };
    steps += close(following, kinds);
    [active, following] = [following, active];
  }
  return { matched: active[count] === 1, steps, consumed };
}

// A matcher with .test(path) and .measure(path) (the answer with the steps, the tokens and the characters read); the pattern is checked once here.
function compileGlob(pattern) {
  const text = normalizePattern(pattern);
  if (text === '') throw new UsageError('A glob must not be empty.');
  if (text.length > MAX_PATTERN_LENGTH) throw new UsageError(`A glob may have at most ${MAX_PATTERN_LENGTH} characters, "${text.slice(0, 40)}..." has ${text.length}.`);
  if (REFUSED.test(text)) throw new UsageError(`Unsupported glob syntax in "${pattern}": only *, ** and ? are supported.`);
  const compiled = tokenize(text);
  const tokens = compiled.kinds.length;
  return Object.freeze({
    pattern: text,
    test: (input) => run(compiled, String(input)).matched,
    measure: (input) => ({ ...run(compiled, String(input)), tokens })
  });
}

function matchesGlob(relativePath, pattern) {
  return compileGlob(pattern).test(normalizePattern(relativePath));
}

// The old name: it returned a backtracking RegExp, which a long file name against several stars could freeze for hours (F4 of the U009 review).
// It now returns the linear matcher; only .test(path) and .measure(path) are offered, not the rest of the RegExp API.
module.exports = Object.freeze({ MAX_PATTERN_LENGTH, normalizePattern, hasMagic, compileGlob, globToRegExp: compileGlob, matchesGlob });
