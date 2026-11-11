'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function pin(bytes, item) {
  return sha(bytes) === item.raw || sha(lf(bytes)) === item.lf;
}
function capture(directory, reader = file => fs.readFileSync(file)) {
  const issues = [], manifest = JSON.parse(reader(path.join(directory, 'manifest.json')));
  const add = code => issues.push(code);
  if (manifest.error || manifest.signal || manifest.exit !== manifest.expectedExit) add('CAPTURE_OUTCOME');
  for (const input of manifest.inputs) {
    const bytes = reader(path.join(directory, 'sources', input.path));
    if (sha(bytes) !== input.sha256 || bytes.length !== input.bytes || sha(lf(bytes)) !== input.lfSha256) add('CAPTURE_SOURCE:' + input.path);
  }
  for (const kind of ['stdout', 'stderr']) {
    const meta = manifest[kind], gzip = reader(path.join(directory, meta.file));
    if (sha(gzip) !== meta.gzipSha256) add('CAPTURE_GZIP:' + kind);
    try {
      const raw = zlib.gunzipSync(gzip);
      if (sha(raw) !== meta.rawSha256 || raw.length !== meta.rawBytes) add('CAPTURE_RAW:' + kind);
    } catch { add('CAPTURE_GZIP_DECODE:' + kind); }
  }
  return issues;
}
module.exports = { sha, lf, pin, capture };
