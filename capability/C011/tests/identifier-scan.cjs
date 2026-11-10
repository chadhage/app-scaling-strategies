'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');

function scan(directory = root) {
  const users = new Set([process.env.USERNAME, /[\\/]Users[\\/]([^\\/]+)/i.exec(process.cwd())?.[1]].filter(Boolean).map((value) => value.toLowerCase()));
  const findings = [];
  let files = 0;
  let decodedStreams = 0;
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      const relative = path.relative(directory, file).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) { findings.push({ path: relative, rule: 'REPARSE_POINT' }); continue; }
      if (entry.isDirectory()) { walk(file); continue; }
      files += 1;
      let bytes = fs.readFileSync(file);
      if (entry.name.endsWith('.gz')) {
        try { bytes = gunzipSync(bytes); decodedStreams += 1; }
        catch { findings.push({ path: relative, rule: 'INVALID_GZIP_STREAM' }); continue; }
      }
      const text = bytes.toString('utf8');
      if (/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/i.test(text)) findings.push({ path: relative, rule: 'LOCAL_PROFILE_PATH' });
      if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) findings.push({ path: relative, rule: 'SESSION_IDENTIFIER' });
      for (const user of users) if (user.length >= 3 && text.toLowerCase().includes(user)) {
        findings.push({ path: relative, rule: 'LOCAL_USER_IDENTIFIER' });
        break;
      }
    }
  }
  walk(directory);
  return { schema: 'C011-identifier-scan/1', files, decodedStreams, findings, passed: findings.length === 0 };
}
module.exports = Object.freeze({ scan });
if (require.main === module) {
  const result = scan();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
