'use strict';
// Command analysis for the plan containers (V4, V10, A4): every az command and every statement of a container is parsed with the quote-aware
// parser; az commands come from a closed list, carry their own --subscription, and every delete names the guarded target and has its own
// preceding guards (the guard functions or inline az checks), in the same or an enclosing block.
const { parse, commandOf, azParts, optValue } = require('./shell.cjs');

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
  'join-path', 'new-timespan', 'exit', 'throw', 'break', 'continue', 'return', 'param', 'function', 'try', 'catch', 'finally', 'else', 'elseif', 'if', 'foreach', 'for', 'while', 'do', 'switch']);
const EXPRESSION = /^[$[@\d'".-]/;

const lower = (s) => String(s === undefined ? '' : s).toLowerCase();
const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => x === b[i]);

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
  const body = parsed.statements.filter((s) => s.blocks.some((id) => ids.has(id))).map(describe);
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
function guardsOf(list, k, fnOk) {
  let prev = -1;
  for (let j = 0; j < k; j += 1) if (list[j].kind === 'az' && list[j].destructive) prev = j;
  const d = list[k];
  let pin = false;
  let own = false;
  for (let j = prev + 1; j < k; j += 1) {
    const g = list[j];
    if (!isPrefix(g.st.blocks, d.st.blocks)) continue;
    if (g.kind === 'other' && !g.quoted && !g.call && g.st.words.length === 1 && fnOk) {
      if (g.name === 'assert-subscription') pin = true;
      if (g.name === 'assert-lease') own = true;
    } else if (g.kind === 'az' && g.sub === 'account show') pin = true;
    else if (g.kind === 'az' && g.sub === 'group show' && lower(optValue(g.parts.opts, '--name')) === lower(targetOf(d)) && lower(optValue(g.parts.opts, '--subscription')) === lower(optValue(d.parts.opts, '--subscription'))) own = true;
  }
  return pin && own;
}

// Analyses one container (a section or the script). Returns the parsed text and the descriptions; findings go through add(code, path, message).
function analyze(lines, path, add, { script = false } = {}) {
  const parsed = parse(lines);
  const list = parsed.statements.map(describe);
  const pinProblems = guardFunctionProblems(parsed, 'assert-subscription');
  const leaseProblems = guardFunctionProblems(parsed, 'assert-lease');
  const fnOk = pinProblems.length === 0 && leaseProblems.length === 0;
  list.forEach((d, k) => {
    const where = `${path} (line ${d.st.line})`;
    if (d.kind === 'other') {
      const inParen = d.st.blocks.some((id) => lower(parsed.blocks[id].kind) === 'paren');
      if (d.call || DENY.test(d.name)) add('COMMAND_FORBIDDEN', where, `${d.call ? 'a call operator' : d.name} is not allowed in a plan command: ${d.st.raw.slice(0, 80)}`);
      else if (!inParen && !ALLOW.has(d.name) && !EXPRESSION.test(d.st.words[0].text) && !d.st.words[0].quoted && !d.st.words[0].text.includes('::')) add('COMMAND_FORBIDDEN', where, `${d.name} is not in the list of commands a plan may use: ${d.st.raw.slice(0, 80)}`);
    }
    if (d.kind !== 'az') return;
    if (d.dynamic || d.parts.dynamic) { add('COMMAND_DYNAMIC', where, `an az sub-command that is a variable or an expression hides what runs: ${d.st.raw.slice(0, 80)}`); return; }
    if (!AZ_ALLOWED.includes(d.sub)) add('AZ_COMMAND_NOT_ALLOWED', where, `az ${d.sub} is not one of the commands of this plan`);
    const sub = optValue(d.parts.opts, '--subscription', '--subscriptions');
    if (!NO_SUBSCRIPTION.has(d.sub) && !PIN.has(lower(sub))) add('AZ_NO_SUBSCRIPTION', where, `az ${d.sub} must carry its own --subscription <subscription-id> (found ${sub === undefined ? 'none' : JSON.stringify(sub)}): ${d.st.raw.slice(0, 80)}`);
    if (!d.destructive) return;
    if (!GROUP.has(lower(targetOf(d)))) add('DELETE_TARGET', where, `a delete must name the guarded resource group <rg> or $Group (found ${JSON.stringify(targetOf(d))}): ${d.st.raw.slice(0, 80)}`);
    if (!guardsOf(list, k, fnOk) || d.st.orElse) add(script ? 'SCRIPT_DELETE_UNGUARDED' : 'DELETE_UNGUARDED', where, `a delete needs its own preceding pin (G2) and ownership check (G3) for the same group in the same or an enclosing block, and must not sit behind ||: ${d.st.raw.slice(0, 80)}`);
  });
  return { parsed, list, pinProblems, leaseProblems };
}

module.exports = { analyze, describe, guardFunctionProblems, targetOf, AZ_ALLOWED, PIN, GROUP, lower };
