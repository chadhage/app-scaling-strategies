'use strict';

// A strict JSON reader for the request bodies: it refuses what JSON.parse silently accepts. A duplicate member name, nesting beyond `depth`,
// a control character in a string and any malformed token are failures; a number is returned only when it is written as a plain integer
// (no fraction, no exponent, no `-0`, a safe integer): every other number is returned as UNSAFE, which no validator accepts. Objects have no
// prototype, so a member named __proto__ or constructor is an ordinary unknown member and can never reach a prototype.
const UNSAFE = Symbol('unsafe-number');
const FAILED = Object.freeze({ ok: false });
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const PLAIN = /^-?(?:0|[1-9][0-9]*)$/;
const ESCAPE = /^(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/;
const LITERALS = Object.freeze({ true: true, false: false, null: null });

function parseStrict(text, { depth = 6 } = {}) {
  const stop = Symbol('stop');
  const fail = () => { throw stop; };
  let at = 0;
  const white = () => { while (at < text.length && ' \t\n\r'.includes(text[at])) at += 1; };

  function string() {
    let end = at + 1;
    for (;;) {
      const char = text[end];
      if (char === undefined || char < ' ') fail();
      if (char === '"') break;
      if (char !== '\\') {
        end += 1;
        continue;
      }
      const escape = ESCAPE.exec(text.slice(end + 1, end + 6));
      if (escape === null) fail();
      end += 1 + escape[0].length;
    }
    const decoded = JSON.parse(text.slice(at, end + 1));
    at = end + 1;
    return decoded;
  }

  function object(level) {
    at += 1;
    const result = Object.create(null);
    white();
    if (text[at] === '}') { at += 1; return result; }
    for (;;) {
      white();
      if (text[at] !== '"') fail();
      const name = string();
      if (Object.hasOwn(result, name)) fail();
      white();
      if (text[at] !== ':') fail();
      at += 1;
      result[name] = value(level + 1);
      white();
      if (text[at] === '}') { at += 1; return result; }
      if (text[at] !== ',') fail();
      at += 1;
    }
  }

  function array(level) {
    at += 1;
    const result = [];
    white();
    if (text[at] === ']') { at += 1; return result; }
    for (;;) {
      result.push(value(level + 1));
      white();
      if (text[at] === ']') { at += 1; return result; }
      if (text[at] !== ',') fail();
      at += 1;
    }
  }

  function value(level) {
    white();
    if (level > depth) fail();
    const char = text[at];
    if (char === '{') return object(level);
    if (char === '[') return array(level);
    if (char === '"') return string();
    const literal = Object.keys(LITERALS).find((name) => text.startsWith(name, at));
    if (literal !== undefined) {
      at += literal.length;
      return LITERALS[literal];
    }
    NUMBER.lastIndex = at;
    const match = NUMBER.exec(text);
    if (match === null) fail();
    at += match[0].length;
    return PLAIN.test(match[0]) && match[0] !== '-0' && Number.isSafeInteger(Number(match[0])) ? Number(match[0]) : UNSAFE;
  }

  try {
    const parsed = value(0);
    white();
    if (at !== text.length) fail();
    return { ok: true, value: parsed };
  } catch (thrown) {
    if (thrown !== stop) throw thrown;
    return FAILED;
  }
}

module.exports = Object.freeze({ parseStrict, UNSAFE });
