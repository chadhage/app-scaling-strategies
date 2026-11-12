'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const privateValues = [...new Set([process.env.USERPROFILE, process.env.USERNAME, process.env.COMPUTERNAME,
  ...Object.entries(process.env).filter(([key, value]) => /TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY|API[_-]?KEY/i.test(key) && value.length >= 8).map(([, value]) => value)]
  .filter(value => typeof value === 'string' && value.length >= 4))];
function scrub(text) {
  let result = text;
  for (const value of privateValues.sort((a, b) => b.length - a.length)) {
    for (const form of new Set([value, value.replaceAll('\\', '\\\\'), value.replaceAll('\\', '/')])) result = result.replace(new RegExp(escape(form), 'gi'), '<private-value>');
  }
  result = result.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>,;:)]+/gi, '<local-profile>')
    .replace(/\bc(?:009|022)_[A-Za-z0-9_-]{43}\b/g, '<opaque-synthetic-token>');
  return result;
}
function decoded(text) {
  const views = [], seen = new Set();
  for (const match of text.matchAll(/[A-Za-z0-9+/_-]{32,}={0,2}/g)) {
    const token = match[0]; if (token.length > 2000000 || seen.has(token)) continue; seen.add(token);
    const bytes = Buffer.from(token.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
    for (const encoding of ['utf8', 'utf16le']) {
      const value = bytes.toString(encoding);
      if (value.length < 8 || value.includes('\ufffd') || !/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(value)) continue;
      const ascii = (value.match(/[\x09\x0a\x0d\x20-\x7e]/g) || []).length;
      if (ascii / value.length < 0.85 && findings(value).length === 0) continue;
      views.push({ encoded: token, encoding, text: value });
    }
  }
  return views;
}
function project(text) {
  let result = scrub(text), encodedTransforms = 0;
  for (const view of decoded(result)) {
    const transformed = scrub(view.text);
    if (transformed !== view.text) {
      result = result.replaceAll(view.encoded, Buffer.from(transformed, view.encoding).toString('base64')); encodedTransforms++;
    }
  }
  return { text: result, encodedTransforms };
}
function findings(text) {
  const results = [];
  for (const value of privateValues) if (text.toLowerCase().includes(value.toLowerCase()) ||
    text.toLowerCase().includes(value.replaceAll('\\', '\\\\').toLowerCase()) || text.toLowerCase().includes(value.replaceAll('\\', '/').toLowerCase())) results.push('LOCAL_PROFILE_OR_ENV_SECRET_VALUE');
  if (/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>,;:)]+/i.test(text)) results.push('LOCAL_PROFILE_PATH');
  if (/\bc(?:009|022)_[A-Za-z0-9_-]{43}\b/.test(text)) results.push('OPAQUE_SYNTHETIC_BEARER_TOKEN');
  return [...new Set(results)];
}
function list(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('PUBLIC_SOURCE_ALIAS_REFUSED');
    return entry.isDirectory() ? list(path.join(directory, entry.name), path.join(prefix, entry.name)) : [path.join(prefix, entry.name)];
  });
}
function scan(directory) {
  const rows = [];
  for (const relative of list(directory)) {
    const bytes = fs.readFileSync(path.join(directory, relative)), views = [{ role: 'raw-file', bytes }];
    for (let index = 0; index < views.length; index++) {
      const view = views[index], payload = view.bytes;
      if (payload[0] === 0x1f && payload[1] === 0x8b) views.push({ role: view.role + ':expanded-gzip', bytes: zlib.gunzipSync(payload, { maxOutputLength: 256 * 1024 * 1024 }) });
      const text = payload.toString('utf8');
      for (const value of decoded(text)) views.push({ role: view.role + ':decoded-base64-' + value.encoding, bytes: Buffer.from(value.text, 'utf8') });
      view.findings = findings(text); view.sha256 = sha(payload); view.bytesCount = payload.length;
      if (views.length > 200000) throw new Error('PUBLIC_SCAN_DECODE_DOMAIN_TOO_LARGE_NONPASS');
    }
    rows.push({ path: relative.replaceAll('\\', '/'), sha256: sha(bytes), bytes: bytes.length,
      views: views.map(({ role, sha256, bytesCount, findings }) => ({ role, sha256, bytes: bytesCount, findings })) });
  }
  const failed = rows.filter(row => row.views.some(view => view.findings.length));
  return { schema: 'C047-all-public-files-expanded-gzip-decoded-base64-privacy/1', allActualPublicFiles: rows.length, rows,
    scannedViews: rows.reduce((n, row) => n + row.views.length, 0), findingsFiles: failed.length, findings: failed, profileIdentifiersOrSecretsPrinted: false };
}
module.exports = { sha, project, findings, decoded, list, scan };
