'use strict';
// Rule 3: a cleanup and rollback plan whose destructive steps carry the three guards (exists gate, subscription pin, tag check).
const { negative, assert, test, load, run, reseal } = require('./support.cjs');

const plan = (p) => p.cleanupAndRollback;
const guard = (p, id) => plan(p).guards.find((g) => g.id === id);
const arming = (p, re) => plan(p).armingSequence.find((s) => s.commands.some((c) => re.test(c)));
const script = (p) => plan(p).teardown.job.script;
const del = (p, i = 0) => plan(p).deletionOrder[i];

negative('PLAN_MISSING', 'no cleanup and rollback plan', (p) => { delete p.cleanupAndRollback; });
negative('GUARD_G1_MISSING', 'no pre-creation gate', (p) => { plan(p).guards = plan(p).guards.filter((g) => g.id !== 'G1'); });
negative('GUARD_G1_MISSING', 'a G1 that does not run az group exists', (p) => { guard(p, 'G1').commands = ['az group list']; });
negative('GUARD_G2_MISSING', 'no subscription pin', (p) => { plan(p).guards = plan(p).guards.filter((g) => g.id !== 'G2'); });
negative('GUARD_G3_MISSING', 'no ownership check', (p) => { plan(p).guards = plan(p).guards.filter((g) => g.id !== 'G3'); });
negative('GUARD_G3_MISSING', 'an ownership check that ignores the tags', (p) => { guard(p, 'G3').expect = 'the group exists'; });
negative('GUARD_G4_MISSING', 'no guards inside the verification checks', (p) => { plan(p).guards = plan(p).guards.filter((g) => g.id !== 'G4'); });
negative('ARMING_MISSING', 'no arming sequence', (p) => { plan(p).armingSequence = []; });
negative('ARMING_NO_EXISTS_GATE', 'arming without the pre-creation gate', (p) => { arming(p, /az group exists/).commands = ['echo skipped']; });
negative('ARMING_NO_PIN', 'arming without the subscription pin', (p) => { arming(p, /az account show/).commands = ['echo skipped']; });
negative('ARMING_NO_QUOTA_GATE', 'arming without a non-deploying validation and what-if', (p) => {
  const s = arming(p, /az deployment sub validate/);
  s.commands = s.commands.filter((c) => !/validate|what-if/.test(c));
});
negative('ARMING_NO_JOB', 'arming without the teardown job registration', (p) => {
  const s = arming(p, /Register-ScheduledTask/);
  s.commands = s.commands.filter((c) => !/Register-ScheduledTask/.test(c));
});
negative('ARMING_ORDER', 'the job registered after the group is created', (p) => {
  const a = plan(p).armingSequence;
  const i = a.findIndex((s) => s.commands.some((c) => /Register-ScheduledTask/.test(c)));
  const j = a.findIndex((s) => s.commands.some((c) => /az group create/.test(c)));
  [a[i], a[j]] = [a[j], a[i]];
});
negative('ARMING_ORDER', 'the exists gate run after the group is created', (p) => {
  const a = plan(p).armingSequence;
  const i = a.findIndex((s) => s.commands.some((c) => /az group exists/.test(c)));
  const j = a.findIndex((s) => s.commands.some((c) => /az group create/.test(c)));
  [a[i], a[j]] = [a[j], a[i]];
});
negative('ARMING_TAGS', 'a group created without the lease tags', (p) => {
  const s = arming(p, /az group create/);
  s.commands = s.commands.map((c) => c.replace(/lease-id=\S+/, ''));
});
negative('AZ_NO_SUBSCRIPTION', 'a verification command without --subscription', (p) => { plan(p).verification[2].commands = ['az monitor log-analytics workspace list-deleted-workspaces -o tsv']; });
negative('AZ_NO_SUBSCRIPTION', 'a deletion command without --subscription', (p) => { del(p).commands[1] = del(p).commands[1].replace(/ --subscription <subscription-id>/, ''); });
negative('AZ_NO_SUBSCRIPTION', 'a script line without --subscription', (p) => {
  const i = script(p).findIndex((l) => /az group delete/.test(l));
  script(p)[i] = script(p)[i].replace(' --subscription $Subscription', '');
});
negative('AZ_NO_SUBSCRIPTION', 'a rollback command without --subscription', (p) => { plan(p).rollback[1].commands = ['az webapp deployment slot swap --resource-group <rg> --name <app> --slot staging --target-slot production']; });
negative('ARMING_NO_EXISTS_GATE', 'an exists gate that does not demand false', (p) => { arming(p, /az group exists/).expect = 'prints true'; });
negative('ARMING_NO_QUOTA_GATE', 'a quota gate that does not say STOP', (p) => { arming(p, /az deployment sub validate/).expect = 'both succeed'; });
negative('AZ_NO_SUBSCRIPTION', 'a --subscription flag without a value', (p) => { del(p).commands[1] = 'az webapp delete --resource-group <rg> --name <app> --subscription'; });
negative('AZ_NO_SUBSCRIPTION', 'a --subscription flag followed by another flag', (p) => { del(p).commands[1] = 'az webapp delete --subscription --resource-group <rg> --name <app>'; });
negative('SCRIPT_NO_OWNERSHIP_CHECK', 'a script whose ownership check is empty', (p) => { plan(p).teardown.job.script = script(p).filter((l) => !/az group show|lease-id|lease-expires-utc/.test(l)); });
negative('DELETION_MISSING', 'no deletion order', (p) => { plan(p).deletionOrder = []; });
negative('DELETE_UNGUARDED', 'a delete step without the subscription pin', (p) => { del(p, 4).guards = ['G3']; });
negative('DELETE_UNGUARDED', 'a delete step without the ownership check', (p) => { del(p, 0).guards = ['G2']; });
negative('DELETE_UNGUARDED', 'a delete step with no guards at all (revision 1)', (p) => { del(p, 4).guards = []; });
negative('DELETE_UNGUARDED', 'a revision 1 style step: one command string, no guards', (p) => {
  plan(p).deletionOrder[0] = { n: 2, step: 'Stop the meter', command: 'az webapp delete --resource-group <rg> --name <app>; az appservice plan delete --resource-group <rg> --name <plan> --yes', label: 'estimated' };
});
negative('AZ_NO_SUBSCRIPTION', 'a revision 1 style command string without --subscription', (p) => {
  plan(p).deletionOrder[0] = { n: 2, step: 'Stop the meter', command: 'az webapp delete --resource-group <rg> --name <app>', label: 'estimated' };
});
negative('AZ_NO_SUBSCRIPTION', 'a revision 1 style verification how-string without --subscription', (p) => {
  plan(p).verification[0] = { n: 1, check: 'gone', how: 'az group exists --name <rg> every 5 minutes for up to 60 minutes', expect: 'false' };
});
negative('DELETE_UNGUARDED', 'a delete hidden in a rollback step without guards', (p) => {
  plan(p).rollback[7].commands = ['az group delete --name <rg> --subscription <subscription-id>'];
  plan(p).rollback[7].guards = [];
});
negative('DELETE_UNGUARDED', 'a delete hidden in a verification step with only the pin', (p) => {
  plan(p).verification[2].commands = ['az monitor log-analytics workspace delete --workspace-name <law> --subscription <subscription-id>'];
  plan(p).verification[2].guards = ['G2'];
});
negative('FLAG_UNGUARDED', 'a --force in a verification command', (p) => { plan(p).verification[2].commands = ['az monitor log-analytics workspace delete --force --subscription <subscription-id>']; });
negative('SCRIPT_MISSING', 'no unattended teardown script', (p) => { delete plan(p).teardown.job; });
negative('SCRIPT_NO_PIN', 'a script that never checks the subscription', (p) => { plan(p).teardown.job.script = script(p).filter((l) => !/az account show/.test(l) && !/Assert-Subscription$/.test(l.trim())); });
negative('SCRIPT_DELETE_UNGUARDED', 'a script delete without the ownership check', (p) => {
  const i = script(p).findIndex((l) => /az group delete/.test(l));
  script(p)[i] = script(p)[i].replace('Assert-Lease; ', '');
});
negative('SCRIPT_DELETE_UNGUARDED', 'a script that checks ownership after the delete', (p) => {
  const i = script(p).findIndex((l) => /az group delete/.test(l));
  script(p)[i] = '  az group delete --name $Group --yes --no-wait --subscription $Subscription; Assert-Lease';
});
negative('BACKSTOP_NOT_DELETE_FIRST', 'a script that exports before it deletes', (p) => {
  const i = script(p).findIndex((l) => /az webapp deployment slot delete/.test(l));
  script(p).splice(i, 0, '  az storage blob download-batch --destination out --source evidence --subscription $Subscription');
});
negative('VERIFY_MISSING', 'no verification checks', (p) => { plan(p).verification = []; });
negative('VERIFY_UNGUARDED', 'check 1 without the subscription pin', (p) => { plan(p).verification[0].guards = []; });
negative('VERIFY_UNGUARDED', 'check 2 without the subscription pin', (p) => { plan(p).verification[1].guards = []; });
negative('ROLLBACK_NO_SWAP', 'no slot-swap rollback', (p) => { plan(p).rollback.forEach((r) => { r.commands = []; }); });
negative('ROLLBACK_NO_PREVIEW', 'no swap with preview and reset', (p) => { plan(p).rollback.forEach((r) => { r.commands = r.commands.filter((c) => !/--action (preview|reset)/.test(c)); }); });
negative('LEASE_TAGS', 'lease tags without lease-expires-utc', (p) => { plan(p).leaseTags = plan(p).leaseTags.filter((t) => t[0] !== 'lease-expires-utc'); });
negative('UNRESOLVED_WORDING', 'a command still to be confirmed', (p) => { plan(p).verification[2].expect = 'command name to be confirmed before use'; });

test('a guarded delete outside the deletion order is accepted', () => {
  const p = load();
  p.cleanupAndRollback.rollback[7].commands = ['az group delete --name <rg> --subscription <subscription-id>'];
  p.cleanupAndRollback.rollback[7].guards = ['G2', 'G3'];
  reseal(p);
  assert.equal(run(p).findings.filter((f) => f.code === 'DELETE_UNGUARDED').length, 0);
});

test('the accepted plan lists a delete with both guards in every deletion step', () => {
  const p = load();
  for (const s of p.cleanupAndRollback.deletionOrder.filter((x) => x.commands.some((c) => /\bdelete\b/.test(c) && /^az /.test(c)))) {
    assert.ok(s.guards.includes('G2') && s.guards.includes('G3'));
  }
  assert.equal(run(p).ok, true);
});

test('az account show is the only az command allowed without --subscription', () => {
  const p = load();
  p.cleanupAndRollback.verification[0].commands = ['az account show --query id -o tsv'];
  reseal(p);
  assert.equal(run(p).findings.filter((f) => f.code === 'AZ_NO_SUBSCRIPTION').length, 0);
});
