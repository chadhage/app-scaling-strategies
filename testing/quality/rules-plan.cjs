'use strict';
// Rule 3: a cleanup and rollback plan whose destructive steps carry three guards: the pre-creation gate (az group exists prints false),
// the subscription pin (az account show equals the approved ID; every other az command carries --subscription) and the ownership
// check before each delete (az group show returns the expected name and the lease tags).
const { isObj, isArr, planStatements, azInvocations } = require('./util.cjs');

const CODES = ['PLAN_MISSING', 'GUARD_G1_MISSING', 'GUARD_G2_MISSING', 'GUARD_G3_MISSING', 'GUARD_G4_MISSING', 'ARMING_MISSING', 'ARMING_NO_EXISTS_GATE',
  'ARMING_NO_PIN', 'ARMING_NO_QUOTA_GATE', 'ARMING_NO_JOB', 'ARMING_ORDER', 'ARMING_TAGS', 'AZ_NO_SUBSCRIPTION', 'DELETION_MISSING', 'DELETE_UNGUARDED',
  'FLAG_UNGUARDED', 'SCRIPT_MISSING', 'SCRIPT_NO_PIN', 'SCRIPT_NO_OWNERSHIP_CHECK', 'SCRIPT_DELETE_UNGUARDED', 'BACKSTOP_NOT_DELETE_FIRST', 'VERIFY_MISSING',
  'VERIFY_UNGUARDED', 'ROLLBACK_NO_SWAP', 'ROLLBACK_NO_PREVIEW', 'LEASE_TAGS'];

// az commands that need no --subscription: the pin itself reads the session default on purpose; an extension install is local.
const EXEMPT = new Set(['account show', 'extension add']);
const GUARD_COMMANDS = new Set(['account show', 'group exists', 'group show']);
const DELETE_IN_LINE = /\baz\b[^;]*\bdelete\b/;
// The flag needs a value: a bare trailing --subscription pins nothing.
const SUBSCRIPTION_FLAG = /--subscriptions?(?:\s+|=)(?!-)\S/;
const base = 'cleanupAndRollback';

function checkGuards(plan, add) {
  const guards = isArr(plan.guards) ? plan.guards : [];
  const cmds = (id) => { const g = guards.find((x) => isObj(x) && x.id === id); return g ? { text: isArr(g.commands) ? g.commands.join(' ') : '', expect: String(g.expect || '') } : null; };
  const g1 = cmds('G1');
  if (!g1 || !/az group exists\b/.test(g1.text) || !/--subscription/.test(g1.text) || !/false/.test(g1.expect)) add('GUARD_G1_MISSING', `${base}.guards`, 'G1 pre-creation gate: az group exists --subscription must print false, otherwise stop');
  const g2 = cmds('G2');
  if (!g2 || !/az account show\b/.test(g2.text)) add('GUARD_G2_MISSING', `${base}.guards`, 'G2 subscription pin: az account show must equal the approved subscription ID');
  const g3 = cmds('G3');
  if (!g3 || !/az group show\b/.test(g3.text) || !/--subscription/.test(g3.text) || !/lease-id/.test(g3.expect) || !/lease-expires-utc/.test(g3.expect)) add('GUARD_G3_MISSING', `${base}.guards`, 'G3 ownership check: az group show must return the expected name and the tags lease-id and lease-expires-utc before each delete');
  if (!cmds('G4')) add('GUARD_G4_MISSING', `${base}.guards`, 'G4: the same guards must run inside verification checks 1 and 2');
}

function checkArming(plan, add) {
  const steps = isArr(plan.armingSequence) ? plan.armingSequence : [];
  if (steps.length === 0) { add('ARMING_MISSING', `${base}.armingSequence`, 'an arming sequence with exact commands is required'); return; }
  const at = (re) => steps.findIndex((s) => isObj(s) && isArr(s.commands) && s.commands.some((c) => re.test(c)));
  const index = { exists: at(/az group exists\b/), pin: at(/az account show\b/), validate: at(/az deployment sub validate\b/), whatIf: at(/az deployment sub what-if\b/), job: at(/Register-ScheduledTask\b/), create: at(/az group create\b/) };
  if (index.exists < 0 || !/false/.test(String(steps[index.exists].expect))) add('ARMING_NO_EXISTS_GATE', `${base}.armingSequence`, 'arming must run az group exists before the group is created and demand that it prints false');
  if (index.pin < 0) add('ARMING_NO_PIN', `${base}.armingSequence`, 'arming must pin the subscription with az account show');
  if (index.validate < 0 || index.whatIf < 0 || !/STOP/.test(String(steps[index.validate].expect))) add('ARMING_NO_QUOTA_GATE', `${base}.armingSequence`, 'arming needs the non-deploying quota gate: az deployment sub validate and az deployment sub what-if, and a STOP when either fails');
  if (index.job < 0) add('ARMING_NO_JOB', `${base}.armingSequence`, 'arming must register the teardown job (Register-ScheduledTask) before any billable resource');
  if (index.create < 0) { add('ARMING_TAGS', `${base}.armingSequence`, 'arming needs an az group create command with the lease tags'); return; }
  const create = steps[index.create].commands.find((c) => /az group create\b/.test(c));
  if (!/lease-id=/.test(create) || !/lease-expires-utc/.test(create)) add('ARMING_TAGS', `${base}.armingSequence[${index.create}]`, 'the group must be created with the tags lease-id and lease-expires-utc');
  if ([index.exists, index.pin, index.validate, index.job].some((i) => i > index.create)) add('ARMING_ORDER', `${base}.armingSequence`, 'the exists gate, the pin, the quota gate and the job registration must come before the group is created');
}

function checkSubscriptionPin(plan, add) {
  for (const st of planStatements(plan)) {
    for (const inv of azInvocations(st.text)) {
      if (!EXEMPT.has(inv.command) && !SUBSCRIPTION_FLAG.test(inv.statement)) add('AZ_NO_SUBSCRIPTION', st.path, `az ${inv.command} carries no --subscription <subscription-id>: ${inv.statement.slice(0, 90)}`);
    }
  }
  const outside = planStatements({ guards: plan.guards, armingSequence: plan.armingSequence, verification: plan.verification, rollback: plan.rollback });
  for (const st of outside) if (/--(yes|force|no-wait)\b/.test(st.text)) add('FLAG_UNGUARDED', st.path, 'a destructive flag outside a guarded deletion step');
}

function checkDeletion(plan, add) {
  const deletion = isArr(plan.deletionOrder) ? plan.deletionOrder : [];
  if (deletion.length === 0) add('DELETION_MISSING', `${base}.deletionOrder`, 'an ordered deletion sequence is required');
  // A delete anywhere in the plan (arming, deletion, verification or rollback) needs the pin (G2) and the ownership check (G3) first.
  for (const section of ['armingSequence', 'deletionOrder', 'verification', 'rollback']) {
    (isArr(plan[section]) ? plan[section] : []).forEach((s, i) => {
      const texts = isObj(s) ? [...(isArr(s.commands) ? s.commands : []), ...(typeof s.command === 'string' ? [s.command] : [])] : [];
      const destructive = texts.some((c) => typeof c === 'string' && DELETE_IN_LINE.test(c));
      const guards = isObj(s) && isArr(s.guards) ? s.guards : [];
      if (destructive && !(guards.includes('G2') && guards.includes('G3'))) add('DELETE_UNGUARDED', `${base}.${section}[${i}].guards`, 'a delete step must run the subscription pin (G2) and the ownership check (G3) first');
    });
  }
}

function checkScript(plan, add) {
  const job = isObj(plan.teardown) ? plan.teardown.job : null;
  const script = isObj(job) && isArr(job.script) ? job.script.filter((l) => typeof l === 'string') : null;
  if (!script || script.length === 0) { add('SCRIPT_MISSING', `${base}.teardown.job.script`, 'the unattended teardown job needs a listed script'); return; }
  const firstDelete = script.findIndex((l) => DELETE_IN_LINE.test(l));
  const pin = script.findIndex((l) => /^\s*Assert-Subscription\s*$/.test(l));
  if (!script.some((l) => /az account show\b/.test(l)) || pin < 0 || (firstDelete >= 0 && pin > firstDelete)) add('SCRIPT_NO_PIN', `${base}.teardown.job.script`, 'the script must compare az account show with the approved subscription before its first delete');
  script.forEach((l, i) => {
    const del = l.search(DELETE_IN_LINE);
    const check = l.indexOf('Assert-Lease');
    if (del >= 0 && !(check >= 0 && check < del)) add('SCRIPT_DELETE_UNGUARDED', `${base}.teardown.job.script[${i}]`, 'every delete in the script must be preceded by the ownership check (Assert-Lease) on the same line');
  });
  const text = script.join('\n');
  if (!(/az group show\b/.test(text) && /lease-id/.test(text) && /lease-expires-utc/.test(text))) add('SCRIPT_NO_OWNERSHIP_CHECK', `${base}.teardown.job.script`, 'the ownership check in the script must run az group show and compare the lease-id and lease-expires-utc tags');
  const first = script.find((l) => azInvocations(l).some((inv) => !GUARD_COMMANDS.has(inv.command)));
  if (!first || !DELETE_IN_LINE.test(first)) add('BACKSTOP_NOT_DELETE_FIRST', `${base}.teardown.job.script`, 'the first action of the automatic backstop after the guards must be a deletion');
}

function checkVerificationAndRollback(plan, add) {
  const ver = isArr(plan.verification) ? plan.verification : [];
  if (ver.length < 2) add('VERIFY_MISSING', `${base}.verification`, 'verification checks are required');
  [0, 1].forEach((i) => { if (ver[i] && !(isArr(ver[i].guards) && ver[i].guards.includes('G2'))) add('VERIFY_UNGUARDED', `${base}.verification[${i}].guards`, `verification check ${i + 1} must start with the subscription pin (G2)`); });
  const swaps = (isArr(plan.rollback) ? plan.rollback : []).flatMap((r) => (isObj(r) && isArr(r.commands) ? r.commands : [])).filter((c) => /az webapp deployment slot swap\b/.test(c));
  if (!swaps.some((c) => /--slot\b/.test(c) && /--target-slot\b/.test(c) && SUBSCRIPTION_FLAG.test(c))) add('ROLLBACK_NO_SWAP', `${base}.rollback`, 'the rollback needs an exact az webapp deployment slot swap command with --slot, --target-slot and --subscription');
  if (!(swaps.some((c) => /--action preview\b/.test(c)) && swaps.some((c) => /--action reset\b/.test(c)))) add('ROLLBACK_NO_PREVIEW', `${base}.rollback`, 'the rollback needs the swap-with-preview forms --action preview and --action reset');
  if (!(isArr(plan.leaseTags) && ['lease-id', 'lease-expires-utc'].every((t) => plan.leaseTags.some((x) => isArr(x) && x[0] === t)))) add('LEASE_TAGS', `${base}.leaseTags`, 'lease tags must include lease-id and lease-expires-utc');
}

function checkPlan(packet, add) {
  const plan = packet.cleanupAndRollback;
  if (!isObj(plan)) { add('PLAN_MISSING', base, 'the cleanup and rollback plan is missing'); return; }
  checkGuards(plan, add);
  checkArming(plan, add);
  checkSubscriptionPin(plan, add);
  checkDeletion(plan, add);
  checkScript(plan, add);
  checkVerificationAndRollback(plan, add);
}

module.exports = { CODES, checkPlan };
