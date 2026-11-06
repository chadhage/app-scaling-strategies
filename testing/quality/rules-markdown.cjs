'use strict';
// V8: the markdown copy must say what the JSON says. What the owner reads is derived from the JSON (headings, each ceiling next to its option
// name, the default option and region, every quota status, the price expiry, the allowance and approvals sentences, the decision defaults, the
// hash) and required in the markdown; no dollar amount may appear that the JSON does not contain; every command line of a code block must be a
// command line of the JSON plan (and the other way round); and prose, code and numbers are scanned like the JSON.
const { isObj, isArr } = require('./util.cjs');
const { LIMITS } = require('./limits.cjs');
const { hasMarkRun } = require('./text.cjs');
const { scanIdentifiers, scanWording, registerIds, HASH_PATHS } = require('./rules-hygiene.cjs');
const { destructiveMention, linesOf } = require('./rules-plan.cjs');
const structure = require('./markdown-structure.cjs');

const CODES = ['MARKDOWN_HASH_MISSING', 'MARKDOWN_HEADING_MISSING', 'MARKDOWN_CEILING_MISSING', 'MARKDOWN_DEFAULT_MISSING', 'MARKDOWN_QUOTA_MISSING', 'MARKDOWN_EXPIRY_MISSING',
  'MARKDOWN_ALLOWANCE_MISSING', 'MARKDOWN_APPROVALS_MISSING', 'MARKDOWN_DECISION_MISMATCH', 'MARKDOWN_AMOUNT_UNKNOWN', 'MARKDOWN_COMMAND_MISMATCH', 'MARKDOWN_COMMAND_MISSING', ...structure.CODES];

const HEADINGS = ['## 0. At a glance', '## 0a. State of the repository at HEAD', '## 0b. Quota status of every option and region', '## 1. Pricing evidence', '## 2. Bounded options',
  '## 3. Required resources, costs and exclusions', '## 4. Cleanup and rollback plan', '## 5. Exact owner decisions U002 must collect', '## 6. Risks and assumptions',
  '## Appendix A', '## Appendix B', '## Appendix C', '## Appendix D'];
const APPROVALS = 'approvals.C001 has all six flags false, maximumLiveAzureRuns 0 and authorizedCloudSpend 0';
const COMMAND_FENCES = new Set(['', 'powershell', 'pwsh', 'ps1', 'bash', 'sh', 'cmd', 'shell']);
const FENCE = '```';
const AMOUNT = /\$\d[\d,]*(?:\.\d+)?/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const norm = (s) => String(s).replace(/,/g, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const usd2 = (x) => `$${x.toFixed(2)}`;

// Splits the document into prose lines (with their original line numbers) and the command lines of its code blocks.
function split(markdown) {
  const prose = [];
  const proseNo = [];
  const code = [];
  let open = null;
  markdown.split('\n').forEach((line, index) => {
    const t = line.replace(/\r$/, '');
    if (t.startsWith(FENCE)) open = open === null ? t.slice(3).trim().toLowerCase() : null;
    else if (open !== null && COMMAND_FENCES.has(open)) code.push(t);
    else { prose.push(t); proseNo.push(index + 1); }
  });
  return { prose, proseNo, code };
}

function quotaCells(prose) {
  const start = prose.findIndex((l) => l.startsWith('## 0b.'));
  const rows = [];
  for (let i = start + 1; start >= 0 && i < prose.length && !prose[i].startsWith('## '); i += 1) if (prose[i].startsWith('|')) rows.push(prose[i].split('|').slice(1, -1).map((c) => c.trim()));
  const header = rows.find((r) => r[0] === 'Option and SKU') || [];
  return { header, rows };
}

function checkRequired(packet, markdown, prose, add) {
  const sha = isObj(packet.integrity) ? packet.integrity.packetSha256 : undefined;
  if (typeof sha !== 'string' || !markdown.includes(sha)) add('MARKDOWN_HASH_MISSING', 'markdown', 'the markdown copy must carry the packet SHA-256');
  for (const h of HEADINGS) if (!prose.some((l) => l.startsWith(h))) add('MARKDOWN_HEADING_MISSING', 'markdown', `the markdown copy lacks the heading "${h}"`);
  const options = isArr(packet.options) ? packet.options.filter(isObj) : [];
  for (const o of options) {
    if (typeof o.spendCeilingUsd === 'number' && !prose.some((l) => l.includes(`${o.id} ${o.name}`) && l.includes(usd2(o.spendCeilingUsd)))) add('MARKDOWN_CEILING_MISSING', 'markdown', `no line carries option ${o.id} ${o.name} next to its ceiling ${usd2(o.spendCeilingUsd)}`);
  }
  const d = isObj(packet.defaultChoice) ? packet.defaultChoice : {};
  if (!markdown.includes(`default option ${d.option}`) || !markdown.includes(`default region ${d.region}`)) add('MARKDOWN_DEFAULT_MISSING', 'markdown', `the markdown copy must name the default option ${d.option} and the default region ${d.region}`);
  const { header, rows } = quotaCells(prose);
  const body = rows.filter((r) => r[0] !== 'Option and SKU' && !/^:?-+:?$/.test(r[0]));
  if (body.length !== options.length || body.some((r, i) => r[0] !== `${options[i].id} ${options[i].sku}`)) add('MARKDOWN_QUOTA_MISSING', 'markdown', 'the quota table must list the options in the order of the JSON, one row each');
  for (const o of options) {
    const row = rows.find((r) => r[0] === `${o.id} ${o.sku}`);
    for (const c of isArr(o.regionCandidates) ? o.regionCandidates.filter(isObj) : []) {
      const cell = row ? row[header.indexOf(c.region)] : undefined;
      if (!(typeof cell === 'string' && cell.startsWith(String(c.quotaStatus)))) add('MARKDOWN_QUOTA_MISSING', 'markdown', `the quota table must show ${c.quotaStatus} for option ${o.id} in ${c.region}`);
    }
  }
  const rel = isObj(packet.repositoryState) && isObj(packet.repositoryState.relationToThisPacket) ? packet.repositoryState.relationToThisPacket : {};
  if (typeof rel.allowanceVersusBounds !== 'string' || !markdown.includes(rel.allowanceVersusBounds)) add('MARKDOWN_ALLOWANCE_MISSING', 'markdown', 'the markdown copy must carry the sentence that relates the owner allowance to the planning bounds');
  if (!markdown.includes(APPROVALS)) add('MARKDOWN_APPROVALS_MISSING', 'markdown', `the markdown copy must say: ${APPROVALS}`);
  const decisions = isObj(packet.ownerDecisions) && isArr(packet.ownerDecisions.decisions) ? packet.ownerDecisions.decisions.filter(isObj) : [];
  const order = decisions.map((dec) => prose.findIndex((l) => l.startsWith(`### ${dec.key}:`)));
  if (order.some((at, i) => at < 0 || (i > 0 && at < order[i - 1]))) add('MARKDOWN_DECISION_MISMATCH', 'markdown', 'the decisions must appear in the order of the JSON');
  for (const dec of decisions) {
    const at = prose.findIndex((l) => l.startsWith(`### ${dec.key}:`));
    if (at < 0 || !prose.slice(at, at + 4).some((l) => l.includes(`Default: **${dec.default}**`))) add('MARKDOWN_DECISION_MISMATCH', 'markdown', `the decision ${dec.key} must show its default ${dec.default} in the markdown copy`);
  }
}

// Every dollar amount of the markdown is a number of the JSON (a figure, a price, a number inside a text) or a group sum of the usage lines
// the markdown tables print (storage, logs, egress per option).
function checkAmounts(packet, markdown, inv, add) {
  const known = new Set(inv.numbers.flatMap((n) => [norm(String(n)), norm(n.toFixed(2))]));
  for (const it of inv.items) for (const m of it.text.match(NUMBER) || []) known.add(norm(m));
  for (const o of isArr(packet.options) ? packet.options : []) {
    const usage = isObj(o) && isObj(o.worstCase) && isArr(o.worstCase.usage) ? o.worstCase.usage.filter((u) => isObj(u) && typeof u.cost === 'number') : [];
    for (const prefixes of [['blob.', 'table.', 'queue.'], ['la.'], ['bw.']]) {
      const sum = usage.filter((u) => prefixes.some((p) => String(u.lineKey).startsWith(p))).reduce((s, u) => s + u.cost, 0);
      known.add(norm(String(Math.round(sum * 1e8) / 1e8)));
    }
  }
  const unknown = [...new Set(markdown.match(AMOUNT) || [])].filter((a) => !known.has(norm(a.slice(1))));
  if (unknown.length > 0) add('MARKDOWN_AMOUNT_UNKNOWN', 'markdown', `dollar amounts the JSON does not contain: ${unknown.slice(0, 5).join(', ')}`);
}

function checkCommands(packet, code, add) {
  const plan = isObj(packet.cleanupAndRollback) ? packet.cleanupAndRollback : {};
  const json = new Set([...['armingSequence', 'deletionOrder', 'verification', 'rollback'].flatMap((s) => linesOf(plan, s)), ...(isArr(plan.guardFunctions) ? plan.guardFunctions : []),
    ...(isObj(plan.teardown) && isObj(plan.teardown.job) && isArr(plan.teardown.job.script) ? plan.teardown.job.script : [])].filter((l) => typeof l === 'string' && l.trim() !== '' && !l.trim().startsWith('#')));
  const shown = new Set(code.filter((l) => l.trim() !== '' && !l.trim().startsWith('#')));
  for (const l of shown) if (!json.has(l)) add('MARKDOWN_COMMAND_MISMATCH', 'markdown', `a code line is not a command line of the JSON plan: ${l.slice(0, 90)}`);
  for (const l of json) if (!shown.has(l)) add('MARKDOWN_COMMAND_MISSING', 'markdown', `a command line of the JSON plan is missing from the markdown code blocks: ${l.slice(0, 90)}`);
}

function checkMarkdown(packet, markdown, add, inv) {
  if (typeof markdown !== 'string') return;
  if (markdown.length > LIMITS.maxMarkdownLength) { add('INPUT_TOO_LARGE', 'markdown', `the markdown copy is longer than ${LIMITS.maxMarkdownLength} characters`); return; }
  if (inv.totalChars + markdown.length > LIMITS.maxTotalChars) { add('INPUT_TOO_LARGE', 'markdown', `the strings of the packet and the markdown together are longer than ${LIMITS.maxTotalChars} characters`); return; }
  if (hasMarkRun(markdown)) { add('INPUT_COMBINING_RUN', 'markdown', `a run of more than ${LIMITS.maxMarkRun} combining marks is refused: normalising it would take super-quadratic time`); return; }
  const { prose, proseNo, code } = split(markdown);
  checkRequired(packet, markdown, prose, add);
  checkAmounts(packet, markdown, inv, add);
  checkCommands(packet, code, add);
  structure.checkStatusAndHeader(packet, prose, add);
  structure.checkGlance(packet, prose, add);
  structure.checkOptions(packet, prose, add);
  structure.checkRecommendation(packet, prose, add);
  structure.checkExpiry(packet, markdown, add);
  structure.checkCodeOrder(packet, code, add);
  structure.checkClaims(prose, proseNo, add);
  const hashes = [...HASH_PATHS].map((p) => p.split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), packet)).filter((h) => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h));
  const masked = [...hashes.map((h) => [h, '<sha256>']), ...[...registerIds(packet)].map((id) => [id, '<line-id>'])];
  const whole = masked.reduce((t, [from, to]) => t.split(from).join(to), [...prose, ...code].join('\n'));
  scanIdentifiers(whole, 'markdown', add);
  prose.forEach((l, i) => { scanWording(l, `markdown:line ${proseNo[i]}`, add); if (destructiveMention(l)) add('DELETE_OUTSIDE_COMMANDS', `markdown:line ${proseNo[i]}`, 'a destructive command may only appear in a code block that is a command line of the JSON plan'); });
}

module.exports = { CODES, checkMarkdown, split };
