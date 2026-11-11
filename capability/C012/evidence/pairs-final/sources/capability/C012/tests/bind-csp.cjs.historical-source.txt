'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { remaining } = require('./budget.cjs');
remaining();
const file = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');
const hash = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('base64');
const theme = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
html = html.replace(/script-src 'self' 'sha256-[^']+'/,
  "script-src 'self' 'sha256-" + hash(theme) + "'").replace(/style-src 'sha256-[^']+'/,
  "style-src 'sha256-" + hash(style) + "'");
fs.writeFileSync(file, html);
console.log(JSON.stringify({ themeHash: hash(theme), styleHash: hash(style), htmlBytes: Buffer.byteLength(html), browserHTMLNewlineNormalization: 'CRLF to LF before CSP hashing' }));
