(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.defineProperty(root, 'C002JsonInput', { value: factory() });
  }
}(globalThis, function () {
  'use strict';

  function exactSafeInteger(source) {
    const value = Number(source);
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) return false;
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source);
    const fraction = match[3] || '';
    const digits = `${match[2]}${fraction}`.replace(/^0+/, '');
    if (!digits) return true;
    if (value === 0) return false;
    const exponent = Number(match[4] || 0);
    if (!Number.isSafeInteger(exponent)) return false;
    const scale = exponent - fraction.length;
    let integer;
    if (scale >= 0) {
      if (digits.length + scale > 16) return false;
      integer = digits + '0'.repeat(scale);
    } else {
      const count = -scale;
      if (count >= digits.length || !/^0+$/.test(digits.slice(-count))) return false;
      integer = digits.slice(0, -count);
    }
    return `${match[1]}${integer}` === String(value);
  }

  function parseJsonInput(text, rootPath) {
    const errors = [];
    const path = typeof rootPath === 'string' && rootPath ? rootPath : '$';
    const add = (field, code, message) => errors.push({ path: field, code, message });
    if (typeof text !== 'string' || !text.trim()) {
      add(path, 'REQUIRED_JSON', 'Explicit JSON is required; no default or previous value is supplied.');
      return { value: null, errors };
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      add(path, 'INVALID_JSON', 'Malformed JSON. Supply one JSON object; comments and trailing commas are not accepted.');
      return { value: null, errors };
    }

    // Scan the already syntactically valid source before JSON.parse can hide
    // duplicate fields or round a non-integer literal into an integer value.
    const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g);
    let index = 0;
    function inspect(field, depth) {
      if (depth > 16) {
        add(field, 'INPUT_DEPTH_EXCEEDED', 'JSON nesting exceeds the local parser safety limit of 16; the visible contract needs no deep nesting.');
        return false;
      }
      const token = tokens[index++];
      if (token === '{') {
        const keys = new Set();
        while (tokens[index] !== '}') {
          const key = JSON.parse(tokens[index++]);
          const next = field === '$' ? key : `${field}.${key}`;
          if (keys.has(key)) {
            add(next, 'DUPLICATE_FIELD', 'Duplicate JSON field; earlier values must not be hidden by later input.');
          }
          keys.add(key);
          index++;
          if (!inspect(next, depth + 1)) return false;
          if (tokens[index] !== ',') break;
          index++;
        }
        index++;
      } else if (token === '[') {
        let item = 0;
        while (tokens[index] !== ']') {
          if (!inspect(`${field}[${item++}]`, depth + 1)) return false;
          if (tokens[index] !== ',') break;
          index++;
        }
        index++;
      } else if (/^-?\d/.test(token) && !exactSafeInteger(token)) {
        add(field, 'UNSAFE_NUMBER_LITERAL',
          'Numeric literal must represent an exact finite safe integer, not a fraction, rounded/underflowed value, or negative zero.');
      }
      return true;
    }
    inspect(path, 0);
    return { value: errors.length ? null : value, errors };
  }

  return Object.freeze({ parseJsonInput });
}));
