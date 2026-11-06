'use strict';
// Rule 3 (V4, V10, A1 to A5): the cleanup and rollback plan. Guards G1 to G4 exist; every container (arming, deletion order, verification,
// rollback, unattended script) is parsed command by command; no destructive command may appear anywhere else in the packet; the arming
// sequence is ordered, culture-invariant and checks its own trigger time; the unattended script wraps every delete, never stops at the
// first failure, always ends with the guarded group delete and raises a persistent alarm.
const { isObj, isArr } = require('./util.cjs');
const { fold } = require('./text.cjs');
const { optValue } = require('./shell.cjs');
const { analyze, describe, PIN, lower } = require('./rules-commands.cjs');

const CODES = ['PLAN_MISSING', 'PLAN_SHAPE', 'GUARD_G1_MISSING', 'GUARD_G2_MISSING', 'GUARD_G3_MISSING', 'GUARD_G4_MISSING', 'ARMING_MISSING', 'ARMING_NO_EXISTS_GATE',
  'ARMING_NO_PIN', 'ARMING_NO_QUOTA_GATE', 'ARMING_QUOTA_PARAMETERS', 'ARMING_NO_JOB', 'ARMING_ORDER', 'ARMING_TAGS', 'ARMING_TRIGGER_NOT_CHECKED', 'TIME_NOT_INVARIANT',
  'AZ_NO_SUBSCRIPTION', 'AZ_COMMAND_NOT_ALLOWED', 'COMMAND_FORBIDDEN', 'COMMAND_DYNAMIC', 'DELETE_TARGET', 'DELETE_OUTSIDE_COMMANDS', 'DELETION_MISSING', 'DELETE_UNGUARDED',
  'SCRIPT_MISSING', 'SCRIPT_NO_PIN', 'SCRIPT_NO_OWNERSHIP_CHECK', 'SCRIPT_GUARD_FUNCTION', 'SCRIPT_NO_STOP', 'SCRIPT_CATCH_SILENT', 'SCRIPT_DELETE_NOT_WRAPPED',
  'SCRIPT_NO_FINAL_GROUP_DELETE', 'SCRIPT_NO_FAILURE_EXIT', 'SCRIPT_NO_ALARM_FILE', 'SCRIPT_DELETE_UNGUARDED', 'TEARDOWN_LIMITS_MISSING', 'BACKSTOP_NOT_DELETE_FIRST',
  'VERIFY_MISSING', 'VERIFY_UNGUARDED', 'ROLLBACK_NO_SWAP', 'ROLLBACK_NO_PREVIEW', 'LEASE_TAGS'];

const BASE = 'cleanupAndRollback';
// The documented keys of a step; anything else (cmds, command, how) could hide a command from the analysis, so it fails closed.
const STEP_KEYS = {
  guards: ['id', 'name', 'commands', 'expect', 'onFailure'], armingSequence: ['n', 'step', 'commands', 'guards', 'expect', 'label'],
  deletionOrder: ['n', 'step', 'commands', 'guards', 'label', 'why'], verification: ['n', 'check', 'guards', 'commands', 'expect', 'label', 'portal'], rollback: ['id', 'when', 'commands', 'label', 'action']
};
const COMMAND_PATH = /^cleanupAndRollback\.(?:(?:guards|armingSequence|deletionOrder|verification|rollback)\[\d+\]\.commands\[\d+\]|guardFunctions\[\d+\]|teardown\.job\.script\[\d+\])$/;
// A destructive command written anywhere but in a command container: in prose, in another field, in the markdown.
const DESTRUCTIVE = /\baz(?:\.cmd|\.exe)?\s[\s\S]{0,120}?\b(?:delete|remove|purge)\b|\bremove-az\w*|\bremove-azurerm\w*|-method\s+delete\b|--mode\s+complete\b|\bazd\s+(?:down|up|deploy|provision)\b|\bterraform\s+(?:destroy|apply)\b/i;
const destructiveMention = (text) => DESTRUCTIVE.test(fold(text).replace(/\s+/g, ' '));

const stepsOf = (plan, section) => (isArr(plan[section]) ? plan[section] : []);
const linesOf = (plan, section) => stepsOf(plan, section).flatMap((s) => (isObj(s) && isArr(s.commands) ? s.commands.filter((c) => typeof c === 'string') : []));

function checkShape(plan, add) {
  for (const [section, keys] of Object.entries(STEP_KEYS)) {
    stepsOf(plan, section).forEach((s, i) => {
      const p = `${BASE}.${section}[${i}]`;
      if (!isObj(s)) { add('PLAN_SHAPE', p, 'a plan step must be an object'); return; }
      for (const k of Object.keys(s)) if (!keys.includes(k)) add('PLAN_SHAPE', `${p}.${k}`, `${k} is not a documented field of a ${section} step: commands belong in the commands array`);
      if (!isArr(s.commands) || s.commands.some((c) => typeof c !== 'string')) add('PLAN_SHAPE', `${p}.commands`, 'commands must be an array of strings');
    });
  }
}

function checkProse(inv, add) {
  for (const item of inv.items) if (!item.key && !COMMAND_PATH.test(item.path) && destructiveMention(item.text)) add('DELETE_OUTSIDE_COMMANDS', item.path, 'a destructive command may only be written in a guarded command container of the plan, never in prose or another field');
}

function checkGuards(plan, add) {
  const guards = stepsOf(plan, 'guards');
  const cmds = (id) => { const g = guards.find((x) => isObj(x) && x.id === id); return g ? { text: isArr(g.commands) ? g.commands.join(' ') : '', expect: String(g.expect || '') } : null; };
  const g1 = cmds('G1');
  if (!g1 || !/az group exists\b/.test(g1.text) || !/--subscription/.test(g1.text) || !/false/.test(g1.expect)) add('GUARD_G1_MISSING', `${BASE}.guards`, 'G1 pre-creation gate: az group exists --subscription must print false, otherwise stop');
  const g2 = cmds('G2');
  if (!g2 || !/az account show\b/.test(g2.text)) add('GUARD_G2_MISSING', `${BASE}.guards`, 'G2 subscription pin: az account show must equal the approved subscription ID');
  const g3 = cmds('G3');
  if (!g3 || !/az group show\b/.test(g3.text) || !/--subscription/.test(g3.text) || !/lease-id/.test(g3.expect) || !/lease-expires-utc/.test(g3.expect)) add('GUARD_G3_MISSING', `${BASE}.guards`, 'G3 ownership check: az group show must return the expected name and the tags lease-id and lease-expires-utc before each delete');
  if (!cmds('G4')) add('GUARD_G4_MISSING', `${BASE}.guards`, 'G4: the same guards must run inside verification checks 1 and 2');
}

// One ordered list of the arming statements with the step they belong to, to compare positions across steps.
function checkArming(plan, add) {
  const steps = stepsOf(plan, 'armingSequence');
  if (steps.length === 0) { add('ARMING_MISSING', `${BASE}.armingSequence`, 'an arming sequence with exact commands is required'); return; }
  const seq = steps.flatMap((s, n) => analyze(isObj(s) && isArr(s.commands) ? s.commands : [], `${BASE}.armingSequence[${n}]`, add).list.map((d) => ({ d, n })));
  const find = (fn) => seq.findIndex(({ d }) => fn(d));
  const az = (sub) => (d) => d.kind === 'az' && d.sub === sub;
  const at = { exists: find(az('group exists')), pin: find(az('account show')), validate: find(az('deployment sub validate')), whatIf: find(az('deployment sub what-if')), job: find((d) => d.kind === 'other' && d.name === 'register-scheduledtask'), create: find(az('group create')) };
  if (at.exists < 0 || !/false/.test(String(steps[seq[at.exists].n].expect))) add('ARMING_NO_EXISTS_GATE', `${BASE}.armingSequence`, 'arming must run az group exists before the group is created and demand that it prints false');
  if (at.pin < 0) add('ARMING_NO_PIN', `${BASE}.armingSequence`, 'arming must pin the subscription with az account show');
  if (at.validate < 0 || at.whatIf < 0 || !/STOP/.test(String(steps[seq[at.validate >= 0 ? at.validate : 0].n].expect))) add('ARMING_NO_QUOTA_GATE', `${BASE}.armingSequence`, 'arming needs the non-deploying quota gate: az deployment sub validate and az deployment sub what-if, and a STOP when either fails');
  for (const i of [at.validate, at.whatIf].filter((x) => x >= 0)) {
    const o = seq[i].d.parts.opts;
    const params = (o.find((x) => x.name === '--parameters') || { values: [] }).values;
    if (optValue(o, '--location') === undefined || !params.some((v) => v.includes('<region>')) || !params.some((v) => v.includes('<sku>'))) add('ARMING_QUOTA_PARAMETERS', `${BASE}.armingSequence`, 'validate and what-if must set the template parameters for the region (<region>) AND the SKU (<sku>); --location only stores the deployment metadata');
  }
  if (at.job < 0) add('ARMING_NO_JOB', `${BASE}.armingSequence`, 'arming must register the teardown job (Register-ScheduledTask) before any billable resource');
  if (at.create < 0) { add('ARMING_TAGS', `${BASE}.armingSequence`, 'arming needs an az group create command with the lease tags'); return; }
  const tags = (seq[at.create].d.parts.opts.find((x) => x.name === '--tags') || { values: [] }).values;
  if (!tags.some((v) => v.startsWith('lease-id=')) || !tags.some((v) => v.startsWith('lease-expires-utc='))) add('ARMING_TAGS', `${BASE}.armingSequence`, 'the group must be created with the tags lease-id and lease-expires-utc');
  if ([at.exists, at.pin, at.validate, at.whatIf, at.job].some((i) => i > at.create)) add('ARMING_ORDER', `${BASE}.armingSequence`, 'the exists gate, the pin, the quota gate and the job registration must come before the group is created');
  const read = seq.findIndex(({ d }) => /StartBoundary/.test(d.st.raw));
  const after = (fn) => seq.some(({ d }, i) => i > read && fn(d));
  if (at.job < 0 || read < at.job || !after((d) => /\$expires/i.test(d.st.raw)) || !after((d) => d.kind === 'other' && d.name === 'throw' && !d.quoted)) add('ARMING_TRIGGER_NOT_CHECKED', `${BASE}.armingSequence`, 'after registering, the job check must read the trigger StartBoundary and compare it with $expires (and throw on a difference)');
}

// A2: a format or a parse without InvariantCulture depends on the machine culture (fi-FI, da-DK, th-TH and ar-SA all break it).
function checkCulture(plan, add) {
  const sections = [...['armingSequence', 'verification', 'deletionOrder', 'rollback'].map((s) => [s, linesOf(plan, s)]), ['script', isObj(plan.teardown) && isObj(plan.teardown.job) && isArr(plan.teardown.job.script) ? plan.teardown.job.script : []]];
  for (const [name, lines] of sections) {
    lines.forEach((l, i) => {
      if (typeof l === 'string' && (/\.ToString\(\s*'[^']*'\s*\)/.test(l) || /::(?:Parse|ParseExact|TryParse)\(\s*[^,()]+\s*\)/.test(l))) add('TIME_NOT_INVARIANT', `${BASE}.${name}[${i}]`, 'a time format or parse must pass [Globalization.CultureInfo]::InvariantCulture');
    });
  }
}

function checkDeletion(plan, add) {
  if (stepsOf(plan, 'deletionOrder').length === 0) add('DELETION_MISSING', `${BASE}.deletionOrder`, 'an ordered deletion sequence is required');
  const result = analyze(linesOf(plan, 'deletionOrder'), `${BASE}.deletionOrder`, add);
  const bad = (problems, code, what) => { if (problems.length > 0 && result.list.some((d) => d.kind === 'az' && d.destructive)) add(code, `${BASE}.deletionOrder`, `the guard function ${what} ${problems.join(' and ')}`); };
  bad(result.pinProblems, 'SCRIPT_GUARD_FUNCTION', 'Assert-Subscription');
  bad(result.leaseProblems, 'SCRIPT_GUARD_FUNCTION', 'Assert-Lease');
  analyze(isArr(plan.guardFunctions) ? plan.guardFunctions : [], `${BASE}.guardFunctions`, add);
}

module.exports = { CODES, BASE, stepsOf, linesOf, checkShape, checkProse, checkGuards, checkArming, checkCulture, checkDeletion, destructiveMention, PIN, describe, lower };
