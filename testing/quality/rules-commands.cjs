'use strict';
// Command analysis for the plan containers (V4, V10, A4, N4 to N6): every az command and every statement of a container is parsed with the
// quote-aware parser; az commands come from a closed list, carry their own --subscription, every option appears once (az keeps the LAST of a
// repeated option), and every delete names the guarded target and has its own preceding guards (the guard functions or inline az checks), in the same
// or an enclosing block. Guard functions are defined once, the lease variables are assigned once and indirection is refused by name; the closed list
// of statement shapes (shapes.cjs) is the first line of defence, these rules are the second.
const { parse, commandOf, azParts, optValue, isWithin, anyWithin } = require('./shell.cjs');
const { fold } = require('./text.cjs');

const AZ_ALLOWED = ['account show', 'extension add', 'group exists', 'group show', 'group create', 'group delete', 'deployment sub validate', 'deployment sub what-if',
  'webapp deployment slot swap', 'webapp deployment slot delete', 'webapp delete', 'appservice plan delete', 'monitor log-analytics workspace delete',
  'monitor log-analytics workspace list-deleted-workspaces', 'storage account delete', 'role assignment list', 'role assignment delete', 'identity delete', 'graph query'];
const NO_SUBSCRIPTION = new Set(['account show', 'extension add']);
const DELETE_VERB = new Set(['delete', 'remove', 'purge', 'clear']);
const PIN = new Set(['<subscription-id>', '$subscription', '${subscription}']);
const GROUP = new Set(['<rg>', '$group', '${group}']);
const DENY = /^(?:remove-|clear-|stop-|disable-|invoke-|iex$|icm$|start-process$|saps$|cmd$|pwsh$|powershell$|bash$|sh$|wsl$|azd$|terraform$|bicep$|kubectl$|gh$|git$|node$|npm$|curl$|wget$|irm$|iwr$|del$|rm$|rd$|rmdir$|erase$|ri$)/;
const ALLOW = new Set(['az', 'assert-subscription', 'assert-lease', 'get-scheduledtask', 'new-scheduledtaskaction', 'new-scheduledtasktrigger', 'new-scheduledtasksettingsset',
  'register-scheduledtask', 'unregister-scheduledtask', 'start-sleep', 'select-object', 'convertfrom-json', 'set-content', 'add-type', 'write-output', 'write-host',
  'join-path', 'new-timespan', 'test-path', 'exit', 'throw', 'break', 'continue', 'return', 'param', 'function', 'try', 'catch', 'finally', 'else', 'elseif', 'if', 'foreach', 'for', 'while', 'do', 'switch']);
const EXPRESSION = /^[$[@\d'".-]/;
// The long name of every short az option the plan could repeat (argparse treats -n and --name as the same option).
const SHORT = { '-n': '--name', '-g': '--resource-group', '-o': '--output', '-l': '--location', '-q': '--query', '-s': '--subscription', '-h': '--help' };
const LEASE_VARIABLES = new Set(['$subscription', '$group', '$lease', '$app', '$plan', '$workspace', '$storage']);
const GUARD_NAME = /^assert-/;
const ALIASES = new Set(['set-alias', 'new-alias', 'sal', 'nal']);
// A destructive command written anywhere but in a command container: in prose, in another field, in a string literal, in the markdown.
const DESTRUCTIVE = /\baz(?:\.cmd|\.exe)?\s[\s\S]{0,120}?\b(?:delete|remove|purge)\b|\bremove-az\w*|\bremove-azurerm\w*|-method\s+delete\b|--mode\s+complete\b|\bazd\s+(?:down|up|deploy|provision)\b|\bterraform\s+(?:destroy|apply)\b/i;
const destructiveMention = (text) => DESTRUCTIVE.test(fold(text).replace(/\s+/g, ' '));
// Indirection: a way to run text that this analysis cannot see (a process, a script block, a string evaluated later, a script on disk, dot-sourcing).
const INDIRECTION = /\[(?:system\.)?(?:diagnostics\.)?process\]::start|\[scriptblock\]::create|invokescript|invoke-expression|\biex\b|invoke-command|\bicm\b|\.invoke\(|start-process|\bsaps\b|\[activator\]|\[reflection|\[system\.reflection|::getmethod|\[type\]|\bset-content\b[^;]*\.ps1|\badd-type\b[^;]*-(?:type|member)definition|^\.[\s\\/]/i;

const lower = (s) => String(s === undefined ? '' : s).toLowerCase();

// Describes one statement: kind 'az' (with parts), 'other' (name) or 'skip' (operators, empty).
function describe(st) {
  const c = commandOf(st);
  if (!c.head || (c.head.text.startsWith('-') && !c.head.quoted)) return { kind: 'skip', st };
  if (c.name === 'az') {
    const parts = azParts(c.rest);
    const sub = parts.sub.join(' ');
    return { kind: 'az', st, sub, parts, destructive: DELETE_VERB.has(parts.sub[parts.sub.length - 1]) || lower(optValue(parts.opts, '--mode')) === 'complete', dynamic: c.dynamic };
  }
  const name = c.quoted && !c.call ? '' : c.name;
  return { kind: 'other', st, name, call: c.call, dynamic: c.dynamic, quoted: Boolean(c.quoted) };
}

// The group a delete acts on: --name for a group delete, --scope for a role assignment, --resource-group for everything else.
function targetOf(d) {
  const o = d.parts.opts;
  if (optValue(o, '--ids') !== undefined) return undefined;
  if (d.sub === 'group delete') return optValue(o, '--name', '-n');
  if (d.sub === 'role assignment delete') {
    const m = /\/resourcegroups\/([^/\s]+)(?:\/|$)/i.exec(optValue(o, '--scope') || '');
    return m ? m[1] : undefined;
  }
  return optValue(o, '--resource-group', '-g');
}

// Does a function with this name exist with a body that really guards? Returns the missing pieces (empty = fine).
function guardFunctionProblems(parsed, name) {
  const ids = new Set(parsed.blocks.filter((b) => lower(b.kind) === `function:${name}`).map((b) => b.id));
  if (ids.size === 0) return ['is not defined'];
  const body = parsed.statements.filter((s) => anyWithin(parsed, s.block, (b) => ids.has(b.id))).map(describe);
  const has = (re) => body.some((d) => re.test(d.st.raw));
  const problems = [];
  const azs = body.filter((d) => d.kind === 'az');
  const throws = body.some((d) => d.kind === 'other' && d.name === 'throw' && !d.quoted);
  if (name === 'assert-subscription') {
    if (!azs.some((d) => d.sub === 'account show') || !has(/-ne \$subscription/i)) problems.push('does not compare az account show with $Subscription');
  } else if (!azs.some((d) => d.sub === 'group show' && GROUP.has(lower(optValue(d.parts.opts, '--name'))) && PIN.has(lower(optValue(d.parts.opts, '--subscription')))) || !has(/lease-id/) || !has(/lease-expires-utc/) || !has(/\$lease/i)) {
    problems.push('does not compare the group name and the tags lease-id and lease-expires-utc');
  }
  if (!throws) problems.push('does not throw on a mismatch');
  return problems;
}

// Own preceding guards of the delete at position k: a pin and an ownership check after the previous delete, in an enclosing block.
function guardsOf(parsed, list, k, fnOk) {
  let prev = -1;
  for (let j = 0; j < k; j += 1) if (list[j].kind === 'az' && list[j].destructive) prev = j;
  const d = list[k];
  let pin = false;
  let own = false;
  for (let j = prev + 1; j < k; j += 1) {
    const g = list[j];
    if (!isWithin(parsed, d.st.block, g.st.block)) continue;
    if (g.kind === 'other' && !g.quoted && !g.call && g.st.words.length === 1 && fnOk) {
      if (g.name === 'assert-subscription') pin = true;
      if (g.name === 'assert-lease') own = true;
    } else if (g.kind === 'az' && g.sub === 'account show') pin = true;
    else if (g.kind === 'az' && g.sub === 'group show' && lower(optValue(g.parts.opts, '--name')) === lower(targetOf(d)) && lower(optValue(g.parts.opts, '--subscription')) === lower(optValue(d.parts.opts, '--subscription'))) own = true;
  }
  return pin && own;
}

// N4: az (argparse) keeps the LAST occurrence of a repeated option, so a guarded first --name followed by another --name guards nothing.
function duplicateOptions(d, where, add) {
  const seen = new Set();
  for (const o of d.parts.opts) {
    const name = SHORT[o.name] || o.name;
    if (seen.has(name)) add('DUPLICATE_OPTION', where, `az reads the LAST of a repeated option: ${name} appears twice in ${d.st.raw.slice(0, 80)}`);
    seen.add(name);
  }
}

// N5: guard functions exist once and come before their first use, the lease variables are assigned once with their placeholder, no function,
// filter or alias replaces az or a guard.
function redefinitions(list, path, add) {
  const defs = new Map();
  const assigned = new Set();
  list.forEach((d, k) => {
    const st = d.st;
    const first = lower(st.words[0].quoted ? '' : st.words[0].text);
    const where = `${path} (line ${st.line})`;
    if (first === 'function' || first === 'filter') {
      const name = lower(st.words[1] ? st.words[1].text : '').replace(/^(?:global|script|local|private):/, '');
      if (name === 'az') add('GUARD_REDEFINED', where, 'a function or filter named az would replace the az command');
      if (GUARD_NAME.test(name)) defs.set(name, [...(defs.get(name) || []), k]);
    } else if (ALIASES.has(first)) {
      add('GUARD_REDEFINED', where, 'an alias in a guarded step can replace az or a guard');
    } else if (LEASE_VARIABLES.has(first) && st.words[1] && /^[-+*/%]?=$/.test(st.words[1].text)) {
      const placeholder = st.words.length === 3 && st.words[2].quoted && /^<[A-Za-z0-9 |_.-]{1,40}>$/.test(st.words[2].text);
      if (assigned.has(first) || !placeholder) add('LEASE_VARIABLE_REASSIGNED', where, `${st.words[0].text} is assigned again or to another value: the guards would check one value and the delete would use another`);
      assigned.add(first);
    }
  });
  for (const [name, at] of defs) {
    if (at.length > 1) add('GUARD_REDEFINED', path, `${name} is defined ${at.length} times: the last definition wins at run time`);
    const use = list.findIndex((d) => !d.st.words[0].quoted && lower(d.st.words[0].text) === name);
    if (use >= 0 && use < at[0]) add('GUARD_REDEFINED', path, `${name} is used before it is defined`);
  }
}

// N6: indirection hides what runs; a string literal that carries a destructive command is another way to hide it.
function indirections(list, path, add) {
  for (const d of list) {
    const where = `${path} (line ${d.st.line})`;
    if (INDIRECTION.test(d.st.raw)) add('INDIRECTION', where, `a way to run text that the analysis cannot see is not allowed: ${d.st.raw.slice(0, 80)}`);
    else if (d.st.words.some((w) => w.quoted && destructiveMention(w.text))) add('INDIRECTION', where, `a string literal carries a destructive command: ${d.st.raw.slice(0, 80)}`);
  }
}

// Analyses one container (a section or the script). Returns the parsed text and the descriptions; findings go through add(code, path, message).
function analyze(lines, path, add, { script = false } = {}) {
  const parsed = parse(lines);
  if (parsed.error) {
    add(parsed.error.code, path, parsed.error.message);
    return { parsed, list: [], pinProblems: [], leaseProblems: [] };
  }
  const list = parsed.statements.map(describe);
  const pinProblems = guardFunctionProblems(parsed, 'assert-subscription');
  const leaseProblems = guardFunctionProblems(parsed, 'assert-lease');
  const fnOk = pinProblems.length === 0 && leaseProblems.length === 0;
  redefinitions(list, path, add);
  indirections(list, path, add);
  list.forEach((d, k) => {
    const where = `${path} (line ${d.st.line})`;
    if (d.kind === 'other') {
      const inParen = anyWithin(parsed, d.st.block, (b) => lower(b.kind) === 'paren');
      if (d.call || DENY.test(d.name)) add('COMMAND_FORBIDDEN', where, `${d.call ? 'a call operator' : d.name} is not allowed in a plan command: ${d.st.raw.slice(0, 80)}`);
      else if (!inParen && !ALLOW.has(d.name) && !EXPRESSION.test(d.st.words[0].text) && !d.st.words[0].quoted && !d.st.words[0].text.includes('::')) add('COMMAND_FORBIDDEN', where, `${d.name} is not in the list of commands a plan may use: ${d.st.raw.slice(0, 80)}`);
    }
    if (d.kind !== 'az') return;
    if (d.dynamic || d.parts.dynamic) { add('COMMAND_DYNAMIC', where, `an az sub-command that is a variable or an expression hides what runs: ${d.st.raw.slice(0, 80)}`); return; }
    duplicateOptions(d, where, add);
    if (!AZ_ALLOWED.includes(d.sub)) add('AZ_COMMAND_NOT_ALLOWED', where, `az ${d.sub} is not one of the commands of this plan`);
    const sub = optValue(d.parts.opts, '--subscription', '--subscriptions');
    if (!NO_SUBSCRIPTION.has(d.sub) && !PIN.has(lower(sub))) add('AZ_NO_SUBSCRIPTION', where, `az ${d.sub} must carry its own --subscription <subscription-id> (found ${sub === undefined ? 'none' : JSON.stringify(sub)}): ${d.st.raw.slice(0, 80)}`);
    if (!d.destructive) return;
    if (!GROUP.has(lower(targetOf(d)))) add('DELETE_TARGET', where, `a delete must name the guarded resource group <rg> or $Group (found ${JSON.stringify(targetOf(d))}): ${d.st.raw.slice(0, 80)}`);
    if (!guardsOf(parsed, list, k, fnOk) || d.st.orElse) add(script ? 'SCRIPT_DELETE_UNGUARDED' : 'DELETE_UNGUARDED', where, `a delete needs its own preceding pin (G2) and ownership check (G3) for the same group in the same or an enclosing block, and must not sit behind ||: ${d.st.raw.slice(0, 80)}`);
  });
  return { parsed, list, pinProblems, leaseProblems };
}

module.exports = { analyze, describe, guardFunctionProblems, targetOf, destructiveMention, AZ_ALLOWED, PIN, GROUP, lower };
