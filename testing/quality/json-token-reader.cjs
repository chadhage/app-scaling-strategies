'use strict';
// Bounded iterative JSON token reader for duplicate key detection and structural validation.
// Operates character-by-character before JSON.parse to preserve duplicate key information.
// Maintains per-object key sets with proper JSON escape sequence decoding.

const { LIMITS } = require('./limits.cjs');
const { hasMarkRun } = require('./text.cjs');

/**
 * Detect UTF-8 BOM (U+FEFF) at the start of a JSON string.
 * @param {string} jsonStr - JSON text to scan
 * @returns {boolean} - True if BOM detected, false otherwise
 */
function scanForBom(jsonStr) {
  return typeof jsonStr === 'string' && jsonStr.charCodeAt(0) === 0xFEFF;
}

/**
 * Decode JSON escape sequences in a key string extracted from JSON text.
 * Handles: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
 * @param {string} escaped - Key string as extracted from JSON (with escapes still encoded)
 * @returns {string} - Decoded key for identity comparison
 */
function decodeJsonEscapes(escaped) {
  let decoded = '';
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === '\\' && i + 1 < escaped.length) {
      const next = escaped[i + 1];
      if (next === '"' || next === '\\' || next === '/') {
        decoded += next;
        i += 1;
      } else if (next === 'b') {
        decoded += '\b';
        i += 1;
      } else if (next === 'f') {
        decoded += '\f';
        i += 1;
      } else if (next === 'n') {
        decoded += '\n';
        i += 1;
      } else if (next === 'r') {
        decoded += '\r';
        i += 1;
      } else if (next === 't') {
        decoded += '\t';
        i += 1;
      } else if (next === 'u' && i + 5 < escaped.length) {
        const hex = escaped.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          decoded += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          decoded += escaped[i];
        }
      } else {
        decoded += escaped[i];
      }
    } else {
      decoded += escaped[i];
    }
  }
  return decoded;
}

function quoteKey(key) {
  return JSON.stringify(key).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function scanForDuplicates(jsonStr, basePath = '') {
  if (typeof jsonStr !== 'string') throw new TypeError('JSON input must be a string.');
  const source = scanForBom(jsonStr) ? jsonStr.slice(1) : jsonStr;
  if (source.length > LIMITS.maxJsonBytes) {
    return [{ code: 'INPUT_TOO_LARGE', path: basePath, message: `the JSON is longer than ${LIMITS.maxJsonBytes} characters` }];
  }
  const findings = [];
  const stack = [{ kind: 'root', state: 'value', path: basePath }];
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let index = 0;
  let nodes = 0;
  let totalChars = 0;
  let bound = null;
  let wrapperPacket = false;
  let oversizedMarkdown = null;

  const fail = (code, path, message) => { bound = { code, path: path.slice(0, 80), message }; };
  const malformed = () => { throw new SyntaxError(`Malformed JSON at character ${index}.`); };
  const whitespace = () => {
    while (source[index] === ' ' || source[index] === '\t' || source[index] === '\r' || source[index] === '\n') index += 1;
  };
  const propertyPath = (path, key) => {
    const part = quoteKey(key).slice(1, -1);
    return (path ? `${path}.${part}` : part).slice(0, 80);
  };

  function readString(path, markdown = false) {
    const start = index++;
    let length = 0;
    const maxLength = markdown ? LIMITS.maxMarkdownLength : LIMITS.maxStringLength;
    while (index < source.length) {
      const ch = source[index];
      if (ch === '"') {
        index += 1;
        const value = JSON.parse(source.slice(start, index));
        totalChars += value.length;
        if (totalChars > LIMITS.maxTotalChars) {
          fail('INPUT_TOO_LARGE', path, `the strings and keys together are longer than ${LIMITS.maxTotalChars} characters`);
        } else if (hasMarkRun(value)) {
          fail('INPUT_COMBINING_RUN', path, `a run of more than ${LIMITS.maxMarkRun} combining marks is refused`);
        }
        return value;
      }
      if (ch === '\\') {
        index += 1;
        if (source[index] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(index + 1, index + 5))) malformed();
          index += 5;
        } else if ('"\\/bfnrt'.includes(source[index] || '\0')) {
          index += 1;
        } else {
          malformed();
        }
      } else {
        if (source.charCodeAt(index) < 0x20) malformed();
        index += 1;
      }
      length += 1;
      if (markdown && length > LIMITS.maxStringLength && !oversizedMarkdown) {
        oversizedMarkdown = { code: 'INPUT_TOO_LARGE', path, message: `a string or key is longer than ${LIMITS.maxStringLength} characters` };
      }
      if (length > maxLength) {
        fail('INPUT_TOO_LARGE', path, `a ${markdown ? 'markdown copy' : 'string or key'} is longer than ${maxLength} characters`);
        return null;
      }
    }
    malformed();
  }

  function readValue(path, depth, markdown = false) {
    if (depth > LIMITS.maxDepth) {
      fail('INPUT_TOO_DEEP', path, `the input is nested deeper than ${LIMITS.maxDepth} levels`);
      return;
    }
    nodes += 1;
    if (nodes > LIMITS.maxNodes) {
      fail('INPUT_TOO_LARGE', path, `the input has more than ${LIMITS.maxNodes} values`);
      return;
    }
    const ch = source[index];
    if (ch === '{' || ch === '[') {
      index += 1;
      stack.push(ch === '{'
        ? { kind: 'object', state: 'first', path, depth, keys: new Set() }
        : { kind: 'array', state: 'first', path, depth, next: 0 });
    } else if (ch === '"') {
      readString(path, markdown);
    } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      number.lastIndex = index;
      if (!number.exec(source)) malformed();
      index = number.lastIndex;
    } else {
      const literal = ['true', 'false', 'null'].find((word) => source.startsWith(word, index));
      if (!literal) malformed();
      index += literal.length;
    }
  }

  while (stack.length > 0 && !bound) {
    whitespace();
    const frame = stack[stack.length - 1];
    if (frame.kind === 'root') {
      if (frame.state === 'value') {
        frame.state = 'end';
        readValue(frame.path, 0);
      } else {
        if (index !== source.length) malformed();
        stack.pop();
      }
      continue;
    }
    if (frame.kind === 'object') {
      if (frame.state === 'first') {
        if (source[index] === '}') { index += 1; stack.pop(); continue; }
        frame.state = 'key';
      }
      if (frame.state === 'key') {
        if (source[index] !== '"') malformed();
        const key = readString(frame.path);
        if (bound) continue;
        frame.key = key;
        frame.childPath = propertyPath(frame.path, key);
        if (frame.keys.has(key)) {
          findings.push({ code: 'DUPLICATE_JSON_KEY', path: frame.childPath, message: `duplicate JSON key ${quoteKey(key)} in the same object` });
        }
        frame.keys.add(key);
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (source[index] !== ':') malformed();
        index += 1;
        frame.state = 'value';
      } else if (frame.state === 'value') {
        frame.state = 'after';
        if (frame.depth === 0 && frame.key === 'packet') wrapperPacket = source[index] === '{';
        const markdown = frame.depth === 0 && frame.key === 'packetMarkdown' && source[index] === '"';
        readValue(frame.childPath, frame.depth + 1, markdown);
      } else if (source[index] === ',') {
        index += 1;
        frame.state = 'key';
      } else if (source[index] === '}') {
        index += 1;
        stack.pop();
      } else {
        malformed();
      }
      continue;
    }
    if (frame.state === 'first') {
      if (source[index] === ']') { index += 1; stack.pop(); continue; }
      frame.state = 'value';
    }
    if (frame.state === 'value') {
      frame.state = 'after';
      const path = `${frame.path}[${frame.next++}]`.slice(0, 80);
      readValue(path, frame.depth + 1);
    } else if (source[index] === ',') {
      index += 1;
      frame.state = 'value';
    } else if (source[index] === ']') {
      index += 1;
      stack.pop();
    } else {
      malformed();
    }
  }
  // Result envelopes allow a longer markdown string, regardless of field order.
  return bound ? [bound] : oversizedMarkdown && !wrapperPacket ? [oversizedMarkdown] : findings;
}

const findDuplicateJsonKeys = (jsonStr) => scanForDuplicates(jsonStr);

module.exports = { scanForBom, findDuplicateJsonKeys, scanForDuplicates, decodeJsonEscapes, quoteKey };
