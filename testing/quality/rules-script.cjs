'use strict';
// The unattended teardown script, verification and rollback (A4, V4): the script wraps every delete, never stops at the first failure, always
// finishes with the guarded group delete, records every failure, exits non-zero and writes a persistent alarm; the checks and the rollback
// are parsed like every other container.
const { isObj, isArr } = require('./util.cjs');
const { optValue } = require('./shell.cjs');
const { analyze } = require('./rules-commands.cjs');
const plan = require('./rules-plan.cjs');

const CODES = [];
const { BASE } = plan;
const GUARD_AZ = new Set(['account show', 'group exists', 'group show']);
const lower = plan.lower;

const isOther = (d, ...names) => d.kind === 'other' && !d.quoted && names.includes(d.name);

function checkScript(p, add) {
  const job = isObj(p.teardown) ? p.teardown.job : null;
  const script = isObj(job) && isArr(job.script) ? job.script.filter((l) => typeof l === 'string') : null;
  const path = `${BASE}.teardown.job.script`;
  if (!script || script.length === 0) { add('SCRIPT_MISSING', path, 'the unattended teardown job needs a listed script'); return; }
  const { parsed, list, pinProblems, leaseProblems } = analyze(script, path, add, { script: true });
  if (pinProblems.length > 0) { add('SCRIPT_GUARD_FUNCTION', path, `Assert-Subscription ${pinProblems.join(' and ')}`); add('SCRIPT_NO_PIN', path, 'the script must compare az account show with the approved subscription before its first delete'); }
  if (leaseProblems.length > 0) { add('SCRIPT_GUARD_FUNCTION', path, `Assert-Lease ${leaseProblems.join(' and ')}`); add('SCRIPT_NO_OWNERSHIP_CHECK', path, 'the ownership check in the script must run az group show and compare the lease-id and lease-expires-utc tags'); }
  const kind = (id) => lower(parsed.blocks[id].kind);
  const deletes = list.map((d, i) => ({ d, i })).filter(({ d }) => d.kind === 'az' && d.destructive);
  const firstDelete = deletes.length > 0 ? deletes[0].i : list.length;
  const stop = list.findIndex((d) => d.kind === 'other' && /^\$erroractionpreference$/i.test(d.st.words[0].text) && d.st.words[2] && lower(d.st.words[2].text) === 'stop' && d.st.blocks.length === 1);
  if (stop < 0 || stop > firstDelete) add('SCRIPT_NO_STOP', path, "the script must set $ErrorActionPreference = 'Stop' before its first delete, so a failed guard really stops that delete");
  parsed.blocks.forEach((b) => { if (b.kind === 'catch' && b.statements === 0) add('SCRIPT_CATCH_SILENT', path, 'a catch block must record the failure, never swallow it'); });
  for (const { d } of deletes) if (kind(d.st.blocks[d.st.blocks.length - 1]) !== 'try') add('SCRIPT_DELETE_NOT_WRAPPED', `${path} (line ${d.st.line})`, 'every delete must sit in its own try block so one failure does not stop the next delete');
  const last = deletes.length > 0 ? deletes[deletes.length - 1] : null;
  const root = (d) => d.st.blocks.length === 1;
  const finalOk = last && last.d.sub === 'group delete' && last.d.st.blocks.length === 2 && kind(last.d.st.blocks[1]) === 'try'
    && !list.slice(0, last.i).some((d) => root(d) && isOther(d, 'exit', 'return', 'throw'));
  if (!finalOk) add('SCRIPT_NO_FINAL_GROUP_DELETE', path, 'the script must always finish with the guarded group delete (it removes everything): last delete, in its own try block at the top level, after no early exit');
  const after = list.slice(last ? last.i + 1 : 0);
  if (!after.some((d) => isOther(d, 'exit') && d.st.words[1] && d.st.words[1].text === '1')) add('SCRIPT_NO_FAILURE_EXIT', path, 'the script must exit 1 after the group delete when anything failed');
  if (!after.some((d) => isOther(d, 'set-content', 'out-file', 'add-content'))) add('SCRIPT_NO_ALARM_FILE', path, 'the script must write a persistent alarm file the owner will see, not only a dialog');
  const outside = list.filter((d) => d.kind === 'az' && !d.st.blocks.some((id) => kind(id).startsWith('function:')));
  const first = outside.find((d) => !GUARD_AZ.has(d.sub));
  if (!first || !first.destructive) add('BACKSTOP_NOT_DELETE_FIRST', path, 'the first action of the automatic backstop after the guards must be a deletion');
  if (!(isArr(p.teardown.limits) && p.teardown.limits.length > 0 && p.teardown.limits.every((x) => typeof x === 'string' && x.length > 20))) add('TEARDOWN_LIMITS_MISSING', `${BASE}.teardown.limits`, 'state what the unattended job cannot guarantee (machine off, not logged on, session expired)');
}

function checkVerificationAndRollback(p, add) {
  for (const g of plan.stepsOf(p, 'guards')) analyze(isObj(g) && isArr(g.commands) ? g.commands : [], `${BASE}.guards`, add);
  const ver = plan.stepsOf(p, 'verification');
  if (ver.length < 2) add('VERIFY_MISSING', `${BASE}.verification`, 'verification checks are required');
  ver.forEach((v, i) => {
    const { list } = analyze(isObj(v) && isArr(v.commands) ? v.commands : [], `${BASE}.verification[${i}]`, add);
    const firstAz = list.find((d) => d.kind === 'az');
    if (i < 2 && !(firstAz && firstAz.sub === 'account show')) add('VERIFY_UNGUARDED', `${BASE}.verification[${i}].commands`, `verification check ${i + 1} must start with the subscription pin (az account show)`);
  });
  const { list } = analyze(plan.linesOf(p, 'rollback'), `${BASE}.rollback`, add);
  const swaps = list.filter((d) => d.kind === 'az' && d.sub === 'webapp deployment slot swap');
  const actions = swaps.map((d) => lower(optValue(d.parts.opts, '--action')));
  if (!swaps.some((d) => optValue(d.parts.opts, '--slot') !== undefined && optValue(d.parts.opts, '--target-slot') !== undefined && plan.PIN.has(lower(optValue(d.parts.opts, '--subscription'))))) add('ROLLBACK_NO_SWAP', `${BASE}.rollback`, 'the rollback needs an exact az webapp deployment slot swap command with --slot, --target-slot and --subscription');
  if (!(actions.includes('preview') && actions.includes('reset'))) add('ROLLBACK_NO_PREVIEW', `${BASE}.rollback`, 'the rollback needs the swap-with-preview forms --action preview and --action reset');
  if (!(isArr(p.leaseTags) && ['lease-id', 'lease-expires-utc'].every((t) => p.leaseTags.some((x) => isArr(x) && x[0] === t)))) add('LEASE_TAGS', `${BASE}.leaseTags`, 'lease tags must include lease-id and lease-expires-utc');
}

function checkPlan(packet, add, inv) {
  const p = packet.cleanupAndRollback;
  if (!isObj(p)) { add('PLAN_MISSING', BASE, 'the cleanup and rollback plan is missing'); plan.checkProse(inv, add); return; }
  plan.checkShape(p, add);
  plan.checkProse(inv, add);
  plan.checkGuards(p, add);
  plan.checkArming(p, add);
  plan.checkCulture(p, add);
  plan.checkDeletion(p, add);
  checkScript(p, add);
  checkVerificationAndRollback(p, add);
}

module.exports = { CODES, checkPlan };
