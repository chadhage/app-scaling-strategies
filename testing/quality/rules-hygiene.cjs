'use strict';
// Rules 5 and 7 plus wording hygiene: no GUID-shaped ID (except a price meter ID), no e-mail address, no secret-shaped string, the word "hard"
// only with the planning-bound phrase, no unresolved wording, the integrity hash recomputes, and an optional markdown copy matches.
const { isObj, isNum, isStr, isArr, walkStrings, integrityHash } = require('./util.cjs');

const CODES = ['UNRESOLVED_WORDING', 'HARD_WITHOUT_PHRASE', 'GUID_FOUND', 'EMAIL_FOUND', 'SECRET_SHAPED', 'INTEGRITY_MISSING', 'INTEGRITY_MISMATCH',
  'MARKDOWN_HASH_MISSING', 'MARKDOWN_CEILING_MISSING', 'MARKDOWN_REPO_STATE_MISSING'];

const PHRASE = 'planning bound, not enforced by Azure';
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const HARD = /\bhard\b/i;
const UNRESOLVED = /to be confirmed|to be determined|command name to be|\bTBD\b|\bTODO\b/i;
const SECRETS = [/AKIA[0-9A-Z]{16}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bxox[baprs]-[A-Za-z0-9-]{10,}/, /\bsk-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /\b(?:password|secret|token|apikey|api_key|sharedaccesskey|accountkey)\s*[=:]\s*[^\s,;]{8,}/i,
  /[?&](?:sig|sv|se|sas|key|token|code|access_token)=[^&\s]{12,}/i];
const LONG_RUN = /[A-Za-z0-9+/]{40,}={0,2}/;
const URL = /https?:\/\/[^\s)"'`]+/g;
const METER_ID = /^pricing\.lines\[\d+\]\.meterId$/;
// Content hashes the packet carries on purpose (the integrity hash, the hash it supersedes and the pinned C001 snapshot).
const HASH_PATHS = new Set(['integrity.packetSha256', 'revision.supersedes.packetSha256', 'authority.pinnedSnapshotSha256']);

function scanIdentifiers(text, path, add) {
  if (!METER_ID.test(path) && GUID.test(text)) add('GUID_FOUND', path, 'a GUID-shaped value (subscription, tenant or object ID) must never appear: use an owner-supplied placeholder');
  if (EMAIL.test(text)) add('EMAIL_FOUND', path, 'an e-mail address must never appear');
  if (!HASH_PATHS.has(path) && (SECRETS.some((re) => re.test(text)) || LONG_RUN.test(text.replace(URL, '')))) add('SECRET_SHAPED', path, 'a secret-shaped string must never appear');
}

function scanWording(text, path, add) {
  if (HARD.test(text) && !text.includes(PHRASE)) add('HARD_WITHOUT_PHRASE', path, `the word hard may only appear with "${PHRASE}"`);
  if (UNRESOLVED.test(text)) add('UNRESOLVED_WORDING', path, 'no step may be left to be confirmed before use');
}

function checkIntegrity(packet, add) {
  const sha = isObj(packet.integrity) ? packet.integrity.packetSha256 : undefined;
  if (!/^[0-9a-f]{64}$/.test(String(sha || ''))) { add('INTEGRITY_MISSING', 'integrity.packetSha256', 'the packet SHA-256 is required'); return; }
  const actual = integrityHash(packet);
  if (actual !== sha) add('INTEGRITY_MISMATCH', 'integrity.packetSha256', `the content hashes to ${actual}, the packet says ${sha}`);
}

function checkMarkdown(packet, markdown, add) {
  if (typeof markdown !== 'string') return;
  const own = isObj(packet.integrity) ? packet.integrity.packetSha256 : undefined;
  if (!(isStr(own) && markdown.includes(own))) add('MARKDOWN_HASH_MISSING', 'markdown', 'the markdown copy must carry the packet SHA-256');
  (isArr(packet.options) ? packet.options : []).forEach((o, i) => {
    if (isObj(o) && isNum(o.spendCeilingUsd) && !markdown.includes(`$${o.spendCeilingUsd.toFixed(2)}`)) add('MARKDOWN_CEILING_MISSING', `markdown`, `the markdown copy lacks the ceiling of option ${i} ($${o.spendCeilingUsd.toFixed(2)})`);
  });
  if (!/State of the repository at HEAD/.test(markdown)) add('MARKDOWN_REPO_STATE_MISSING', 'markdown', 'the markdown copy needs the section "State of the repository at HEAD"');
  const superseded = isObj(packet.revision) && isObj(packet.revision.supersedes) ? packet.revision.supersedes.packetSha256 : undefined;
  const text = [own, superseded].filter(isStr).reduce((t, h) => t.split(h).join('<sha256>'), markdown);
  scanIdentifiers(text, 'markdown', add);
  text.split(/\r?\n/).forEach((l, i) => scanWording(l, `markdown:line ${i + 1}`, add));
}

function checkHygiene(packet, add, opts) {
  walkStrings(packet, (text, path) => { scanIdentifiers(text, path, add); scanWording(text, path, add); });
  checkIntegrity(packet, add);
  checkMarkdown(packet, opts.markdown, add);
}

module.exports = { CODES, checkHygiene, PHRASE };
