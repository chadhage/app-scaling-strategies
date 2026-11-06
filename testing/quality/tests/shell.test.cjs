'use strict';
// The quote-aware parser and the command analysis (V4, V10): what a shell sees, not what the text looks like.
const { assert, test } = require('./support.cjs');
const { parse, commandOf, azParts, optValue } = require('../shell.cjs');
const { analyze, describe, guardFunctionProblems, targetOf } = require('../rules-commands.cjs');

const heads = (text) => parse(text).statements.map((s) => s.words.map((w) => w.text).join(' '));
const codes = (lines, opts) => { const found = []; analyze(lines, 'x', (code) => found.push(code), opts); return found; };
const GUARDS = ['function Assert-Subscription {', "  if ((az account show --query id -o tsv) -ne $Subscription) { throw 'G2' }", '}',
  'function Assert-Lease {', '  $g = az group show --name $Group --subscription $Subscription -o json | ConvertFrom-Json',
  "  if (-not $g -or $g.name -ine $Group -or $g.tags.'lease-id' -cne $Lease -or -not $g.tags.'lease-expires-utc') { throw 'G3' }", '}'];
const DELETE = 'az group delete --name $Group --yes --subscription $Subscription';

test('statements end at newlines, semicolons, && || | and blocks; comments, strings and continuations do not split', () => {
  assert.deepEqual(heads('a b; c d\ne && f | g || h'), ['a b', 'c d', 'e', 'f', 'g', 'h']);
  assert.deepEqual(heads("echo 'a;b' \"c;d\" # tail\nnext"), ['echo a;b c;d', 'next']);
  assert.deepEqual(heads('az group `\ndelete --name x'), ['az group delete --name x']);
  assert.deepEqual(heads('az group \\\ndelete --name x'), ['az group delete --name x']);
  assert.deepEqual(heads("it''s 'it''s' \"say \"\"hi\"\" `\"x`\"\""), ['its it\'s say "hi" "x"']);
  assert.deepEqual(heads('a${b}c $(d e) @(f g) @{h i} ${x}'), ['a${b}c', 'd e', 'f g', 'h i', '${x}']);
  assert.deepEqual(heads("x @'\nhere; string\n'@ y"), ['x here; string y']);
  assert.deepEqual(heads('echo @"\nline one\n"@\nnext'), ['echo line one', 'next']);
  assert.deepEqual(heads('a &amp; b & c'), ['a', 'amp', 'b', 'c']);
});

test('blocks carry the keyword that opened them, statements are counted, and || marks the statement after it', () => {
  const p = parse("try { a; if ($x) { b } } catch { } function Name { c } foreach ($i in 1..3) { d }");
  const kinds = p.blocks.map((b) => b.kind);
  for (const k of ['try', 'if', 'catch', 'function:Name', 'foreach']) assert.ok(kinds.includes(k), k);
  assert.equal(p.blocks.find((b) => b.kind === 'catch').statements, 0);
  assert.ok(p.blocks.find((b) => b.kind === 'try').statements >= 1);
  const or = parse('a || b && c; d').statements;
  assert.deepEqual(or.map((s) => Boolean(s.orElse)), [false, true, false, false]);
  assert.equal(parse('a\nb').statements[1].line, 2);
});

test('commandOf skips call operators and assignments, strips paths and extensions, and flags dynamic call targets', () => {
  const one = (t) => commandOf(parse(t).statements[0]);
  assert.equal(one('az group show').name, 'az');
  assert.equal(one('az.cmd group show').name, 'az');
  assert.equal(one('C:\\tools\\AZ.EXE group show').name, 'az');
  assert.equal(one('$g = az group show').name, 'az');
  assert.equal(one("& 'az' group show").name, 'az');
  assert.equal(one('& $cmd group show').dynamic, true);
  assert.equal(one("& 'az' x").dynamic, false);
  assert.equal(one('"az" group show').quoted, true);
  assert.equal(commandOf({ words: [] }).name, '');
});

test('azParts reads sub-commands and options, with inline values, several values and flags', () => {
  const b = azParts(commandOf(parse('az group delete --name=rg --yes --tags a=1 b=2 -n short --subscription ""').statements[0]).rest);
  assert.deepEqual(b.sub, ['group', 'delete']);
  assert.equal(b.dynamic, false);
  assert.equal(optValue(b.opts, '--name'), 'rg');
  assert.equal(optValue(b.opts, '--tags'), 'a=1 b=2');
  assert.equal(optValue(b.opts, '--yes'), '');
  assert.equal(optValue(b.opts, '-n'), 'short');
  assert.equal(optValue(b.opts, '--subscription'), '');
  assert.equal(optValue(b.opts, '--missing'), undefined);
  assert.equal(azParts(commandOf(parse('az group $v --name x').statements[0]).rest).dynamic, true);
});

test('az commands come from a closed list and carry their own --subscription with the approved placeholder', () => {
  assert.deepEqual(codes(['az account show --query id -o tsv', 'az extension add --name resource-graph']), []);
  assert.ok(codes(['az login']).includes('AZ_COMMAND_NOT_ALLOWED'));
  assert.ok(codes(['az account set --subscription <subscription-id>']).includes('AZ_COMMAND_NOT_ALLOWED'));
  assert.ok(codes(['az group show --name <rg>']).includes('AZ_NO_SUBSCRIPTION'));
  assert.ok(codes(['az group show --name <rg> --subscription ""']).includes('AZ_NO_SUBSCRIPTION'));
  assert.ok(codes(['az group show --name <rg> --subscription other']).includes('AZ_NO_SUBSCRIPTION'));
  assert.deepEqual(codes(['az group show --name <rg> --SUBSCRIPTION=<subscription-id>', 'az graph query -q "x" --subscriptions $Subscription']), []);
  assert.ok(codes(['az group $v show --name x --subscription <subscription-id>']).includes('COMMAND_DYNAMIC'));
});

test('every other statement is checked against the deny list and the list of commands a plan may use', () => {
  assert.ok(codes(['Remove-AzResourceGroup -Name x']).includes('COMMAND_FORBIDDEN'));
  assert.ok(codes(['Invoke-Expression $x']).includes('COMMAND_FORBIDDEN'));
  assert.ok(codes(['& $x']).includes('COMMAND_FORBIDDEN'));
  assert.ok(codes(['Get-Date']).includes('COMMAND_FORBIDDEN'));
  assert.ok(codes(['azd up']).includes('COMMAND_FORBIDDEN'));
  assert.deepEqual(codes(["$m = 'Remove-Item is not run'", '[void][System.Windows.MessageBox]::Show($m)', '(Join-Path $env:TEMP x)', '.ToString()', 'Start-Sleep -Seconds 3']), []);
});

test('a delete names the guarded group, in the right option, and a role assignment names it in its scope', () => {
  const d = (t) => describe(parse(t).statements[0]);
  assert.equal(targetOf(d('az group delete --name <rg>')), '<rg>');
  assert.equal(targetOf(d('az group delete -n $Group')), '$Group');
  assert.equal(targetOf(d('az webapp delete --resource-group <rg> --name a')), '<rg>');
  assert.equal(targetOf(d('az webapp delete -g <rg>')), '<rg>');
  assert.equal(targetOf(d('az role assignment delete --scope /subscriptions/s/resourceGroups/<rg>/providers/x')), '<rg>');
  assert.equal(targetOf(d('az role assignment delete --scope /subscriptions/s/resourceGroups/<rg>')), '<rg>');
  assert.equal(targetOf(d('az role assignment delete --assignee x')), undefined);
  assert.equal(targetOf(d('az group delete --ids x --name <rg>')), undefined);
  assert.equal(d('az deployment group create --mode Complete').destructive, true);
  assert.equal(d('az group create --name x').destructive, false);
  assert.equal(d('-ne $x').kind, 'skip');
});

test('guards: function calls need valid function bodies; inline az checks need the same group and subscription; they must come first', () => {
  const call = `Assert-Subscription; Assert-Lease; ${DELETE}`;
  assert.deepEqual(codes([...GUARDS, call]), []);
  assert.ok(codes([call]).includes('DELETE_UNGUARDED'), 'calls without function definitions are not guards');
  assert.ok(codes([...GUARDS, DELETE]).includes('DELETE_UNGUARDED'));
  assert.ok(codes([...GUARDS, `${DELETE}; Assert-Subscription; Assert-Lease`]).includes('DELETE_UNGUARDED'));
  assert.ok(codes([...GUARDS, `Assert-Subscription; Assert-Lease; ${DELETE}`, DELETE]).includes('DELETE_UNGUARDED'), 'the second delete has no guards of its own');
  assert.ok(codes([...GUARDS, `Assert-Subscription; Assert-Lease || ${DELETE}`]).includes('DELETE_UNGUARDED'));
  assert.ok(codes([...GUARDS, `Assert-Subscription; if ($false) { Assert-Lease }; ${DELETE}`]).includes('DELETE_UNGUARDED'));
  assert.deepEqual(codes(['az account show --query id -o tsv', 'az group show --name $Group --subscription $Subscription -o json', DELETE]), []);
  assert.ok(codes(['az account show --query id -o tsv', 'az group show --name other --subscription $Subscription -o json', DELETE]).includes('DELETE_UNGUARDED'));
  assert.ok(codes(['az account show --query id -o tsv', 'az group show --name $Group --subscription <subscription-id> -o json', DELETE]).includes('DELETE_UNGUARDED'));
  assert.ok(codes([...GUARDS, "Assert-Subscription; Assert-Lease; az group delete --name rg-other --yes --subscription $Subscription"]).includes('DELETE_TARGET'));
  assert.ok(codes([...GUARDS, 'Assert-Subscription; Assert-Lease; az group delete --ids x --yes --subscription $Subscription']).includes('DELETE_TARGET'));
  assert.ok(codes([...GUARDS, `Assert-Subscription; Assert-Lease; ${DELETE}`], { script: true }).length === 0);
  assert.ok(codes([DELETE], { script: true }).includes('SCRIPT_DELETE_UNGUARDED'));
});

test('guard function bodies must compare, check the tags and throw; each missing piece is named', () => {
  const problems = (lines, name) => guardFunctionProblems(parse(lines), name);
  assert.deepEqual(problems(GUARDS, 'assert-subscription'), []);
  assert.deepEqual(problems(GUARDS, 'assert-lease'), []);
  assert.deepEqual(problems(['x'], 'assert-lease'), ['is not defined']);
  assert.deepEqual(problems(['function Assert-Subscription {', '  # az account show -ne $Subscription throw', '}'], 'assert-subscription'), ['does not compare az account show with $Subscription', 'does not throw on a mismatch']);
  assert.deepEqual(problems(GUARDS.map((l) => l.replace("throw 'G3'", "Write-Output 'G3'")), 'assert-lease'), ['does not throw on a mismatch']);
  assert.deepEqual(problems(GUARDS.map((l) => l.replace("lease-expires-utc", 'other')), 'assert-lease'), ['does not compare the group name and the tags lease-id and lease-expires-utc']);
  assert.deepEqual(problems(GUARDS.map((l) => l.replace('--name $Group', '--name other')), 'assert-lease'), ['does not compare the group name and the tags lease-id and lease-expires-utc']);
});
