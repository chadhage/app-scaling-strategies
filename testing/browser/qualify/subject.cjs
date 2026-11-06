'use strict';

// Parser for the certificate subject that Get-AuthenticodeSignature reports, for example
// "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US".
// A substring match on "Microsoft" is unsafe ("Not Microsoft Corp", O="Evil, O=Microsoft Corporation"),
// so the name is split into attributes first: separators inside quotes or after a backslash do not split.
// Multi-valued components (+) are refused as ambiguous; nothing Microsoft signs with uses them.

const SPECIAL = new Set([',', '+', '"', '\\', '<', '>', ';', '=', '#', ' ']);
const TYPE_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;
const TYPE_OID = /^(?:OID\.)?\d+(?:\.\d+)*$/i;
const ORGANIZATION_OID = '2.5.4.10';

function splitComponents(text) {
  const parts = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      if (i + 1 >= text.length) return { error: 'dangling backslash' };
      current += ch + text[i + 1];
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (!quoted && ch === '+') {
      return { error: 'multi-valued component is not supported' };
    } else if (!quoted && (ch === ',' || ch === ';')) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (quoted) return { error: 'unterminated quote' };
  parts.push(current);
  return { parts };
}

function unescapeValue(text) {
  const chars = Array.from(text);
  const bytes = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === '"') return { error: 'unescaped quote in value' };
    if (chars[i] !== '\\') {
      bytes.push(...Buffer.from(chars[i], 'utf8'));
      continue;
    }
    const hex = chars.slice(i + 1, i + 3).join('');
    if (/^[0-9a-fA-F]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else if (SPECIAL.has(chars[i + 1])) {
      bytes.push(chars[i + 1].charCodeAt(0));
      i += 1;
    } else {
      return { error: 'invalid escape' };
    }
  }
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes)) };
  } catch {
    return { error: 'value is not valid UTF-8' };
  }
}

function decodeValue(raw) {
  const trimmed = raw.replace(/^[ \t]+/, '').replace(/(?<!\\)[ \t]+$/, '');
  if (!trimmed.startsWith('"')) return unescapeValue(trimmed);
  if (!trimmed.endsWith('"')) return { error: 'malformed quoted value' };
  return unescapeValue(trimmed.slice(1, -1));
}

function normalizeType(type) {
  if (TYPE_NAME.test(type)) return type.toUpperCase();
  if (TYPE_OID.test(type)) {
    const oid = type.replace(/^OID\./i, '');
    return oid === ORGANIZATION_OID ? 'O' : `OID.${oid}`;
  }
  return null;
}

function parseSubject(subject) {
  if (typeof subject !== 'string' || subject.trim() === '') return { ok: false, error: 'empty subject' };
  const split = splitComponents(subject);
  if (split.error) return { ok: false, error: split.error };
  const attributes = [];
  for (const part of split.parts) {
    const equals = part.indexOf('=');
    if (equals < 1) return { ok: false, error: 'component without type=value' };
    const type = normalizeType(part.slice(0, equals).trim());
    if (type === null) return { ok: false, error: 'invalid attribute type' };
    const decoded = decodeValue(part.slice(equals + 1));
    if (decoded.error) return { ok: false, error: decoded.error };
    attributes.push({ type, value: decoded.value });
  }
  return { ok: true, attributes };
}

function organizationOf(subject) {
  const parsed = parseSubject(subject);
  if (!parsed.ok) return parsed;
  const organizations = parsed.attributes.filter((attribute) => attribute.type === 'O');
  if (organizations.length === 0) return { ok: false, error: 'no organization (O) attribute' };
  if (organizations.length > 1) return { ok: false, error: 'more than one organization (O) attribute' };
  return { ok: true, organization: organizations[0].value };
}

module.exports = { parseSubject, organizationOf };
