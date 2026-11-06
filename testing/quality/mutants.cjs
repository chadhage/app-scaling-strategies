'use strict';
// The mutants of the mutation run (tooling, not production code). Each one removes or inverts ONE guard of a production file; the listed fast test files
// must fail on it. M-numbers are the mutants of the second independent review (rewritten for the revision 3 code, which no longer has the old lines);
// W-numbers are mutants of the guards added in revision 3.
const D = 'rules-direct.test.cjs';
const SH = 'shell.test.cjs';
const TI = 'text-ident.test.cjs';
const LI = 'limits.test.cjs';
const MD = 'markdown.test.cjs';
const R4S = 'r4-shapes.test.cjs';
const R4B = 'r4-bounds.test.cjs';
const R4MD = 'r4-markdown.test.cjs';
const R4M = 'r4-minor.test.cjs';
const R4C = 'r4-codes.test.cjs';
const R4U = 'r4-units.test.cjs';

const MUTANTS = [
  { id: 'M01', file: 'rules-commands.cjs', find: 'return pin && own;', replace: 'return pin || own;', why: 'a delete needs only one of G2 and G3', tests: [SH, D] },
  { id: 'M02', file: 'rules-commands.cjs', find: 'for (let j = prev + 1; j < k; j += 1) {', replace: 'for (let j = prev + 1; j < list.length; j += 1) {', why: 'guards placed after the delete count', tests: [SH, D] },
  { id: 'M03', file: 'rules-commands.cjs', find: 'if (!isWithin(parsed, d.st.block, g.st.block)) continue;', replace: '', why: 'a guard in a block that does not enclose the delete counts', tests: [SH, D] },
  { id: 'M04', file: 'rules-prices.cjs', find: "line.unitPrice > 0)) add('PRICE_NOT_POSITIVE'", replace: "line.unitPrice >= 0)) add('PRICE_NOT_POSITIVE'", why: 'a zero returned price accepted', tests: [D] },
  { id: 'M05', file: 'rules-options.cjs', find: 'o.teardownLatencyHours >= 1', replace: 'o.teardownLatencyHours >= 0', why: 'no latency hour needed', tests: [D] },
  { id: 'M06', file: 'rules-options.cjs', find: 'else if (o.spendCeilingUsd !== ceilingFor(total))', replace: 'else if (false)', why: 'ceiling rule disabled', tests: [D] },
  { id: 'M08', file: 'ident.cjs', find: "[0-9a-f]{12}`, 'i');", replace: "[0-9a-f]{12}`, '');", why: 'GUID pattern case sensitive', tests: [TI] },
  { id: 'M09', file: 'ident.cjs', find: 'return HARD.test(t) || ENFORCED.test(words(t));', replace: 'return !(HARD.test(t) || ENFORCED.test(words(t)));', why: 'hard rule inverted', tests: [TI] },
  { id: 'M10', file: 'rules-decisions.cjs', find: 'else if (ageDays(price, prepared) > MAX_PRICE_AGE_DAYS)', replace: 'else if (ageDays(price, prepared) >= MAX_PRICE_AGE_DAYS)', why: 'stale at exactly 7 days against the packet date', tests: [D] },
  { id: 'M10b', file: 'rules-decisions.cjs', find: 'else if (ageDays(price, now) > MAX_PRICE_AGE_DAYS)', replace: 'else if (ageDays(price, now) >= MAX_PRICE_AGE_DAYS)', why: 'stale at exactly 7 days against the clock', tests: [D] },
  { id: 'M11', file: 'rules-decisions.cjs', find: "if (found.some((d) => d.default !== 'no'))", replace: "if (found.some((d) => d.default === 'yes'))", why: 'only a literal yes fails', tests: [D] },
  { id: 'M13', file: 'validate-packet.cjs', find: 'return result.ok ? 0 : 1;', replace: 'return 0;', why: 'exit code always 0', tests: [LI] },
  { id: 'M15', file: 'rules-commands.cjs', find: 'if (!NO_SUBSCRIPTION.has(d.sub) && !PIN.has(lower(sub)))', replace: "if (!NO_SUBSCRIPTION.has(d.sub) && d.sub !== 'group delete' && !PIN.has(lower(sub)))", why: 'az group delete exempt from --subscription', tests: [D, SH] },
  { id: 'M19', file: 'rules-prices.cjs', find: '\\bno (?:separate |extra |additional )?(?:charge|cost)\\b|', replace: '', why: 'no charge expected is not a zero claim', tests: [D] },
  { id: 'M21', file: 'shell.cjs', find: "if (t.text.startsWith('-') && t.text.length > 1 && !t.quoted) {", replace: "if (t.text.startsWith('-') && t.text.length > 1 && !t.quoted && opts.length === 0) {", why: 'a flag followed by a flag is a value', tests: [D, SH] },
  { id: 'M25', file: 'rules-plan.cjs', find: '.some((i) => i > at.create)', replace: '.every((i) => i > at.create)', why: 'arming order needs all steps after the create', tests: [D] },
  { id: 'M26', file: 'rules-plan.cjs', find: "if (!cmds('G4')) add('GUARD_G4_MISSING'", replace: "if (false) add('GUARD_G4_MISSING'", why: 'G4 not required', tests: [D] },
  { id: 'M31', file: 'rules-decisions.cjs', find: 'else if (ageDays(price, now) > MAX_PRICE_AGE_DAYS)', replace: 'else if (false)', why: 'staleness against the clock disabled', tests: [D] },
  { id: 'M33', file: 'rules-commands.cjs', find: 'DELETE_VERB.has(parts.sub[parts.sub.length - 1])', replace: "parts.sub.join(' ') === 'group delete'", why: 'only az group delete is destructive', tests: [D, SH] },
  // The day-of-month comparison alone is redundant (an overflowing day always moves the month), so this mutant removes the whole round trip.
  { id: 'W01', file: 'dates.cjs', find: 't.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.getTime() : NaN', replace: 't.getTime()', why: 'no calendar round trip (2026-02-30 passes)', tests: [TI] },
  { id: 'W02', file: 'rules-decisions.cjs', find: "if (price > utcDay(now)) add('PRICE_DATE_FUTURE'", replace: "if (false) add('PRICE_DATE_FUTURE'", why: 'a price date in the future passes', tests: [D] },
  { id: 'W03', file: 'rules-decisions.cjs', find: 'prepared > now + SKEW_MS', replace: 'prepared > now + 1e15', why: 'a packet date in the future passes', tests: [D] },
  { id: 'W04', file: 'limits.cjs', find: 'if (depth > LIMITS.maxDepth)', replace: 'if (depth > 1e9)', why: 'no depth limit', tests: [LI] },
  { id: 'W05', file: 'limits.cjs', find: 'if (value.length > LIMITS.maxStringLength)', replace: 'if (false)', why: 'no string length limit', tests: [LI] },
  { id: 'W06', file: 'ident.cjs', find: '[0-9a-f]{8}${SEP}', replace: '[0-9a-f]{8}', why: 'a GUID with dot or dash separators after the first group passes', tests: [TI] },
  { id: 'W07', file: 'text.cjs', find: ".replace(/[\\s*`~_\\\\]+/g, '')", replace: ".replace(/[*`~_\\\\]+/g, '')", why: 'a GUID split by a line break or spaces passes', tests: [TI] },
  { id: 'W08', file: 'ident.cjs', find: ".replace(/ ?[[({<] ?at ?[\\])}>] ?/gi, '@')", replace: '', why: 'an e-mail written [at] passes', tests: [TI] },
  { id: 'W09', file: 'rules-prices.cjs', find: "if (zero || !isStr(text)) add('ZERO_COST_UNSOURCED'", replace: "if (!isStr(text)) add('ZERO_COST_UNSOURCED'", why: 'a priced row may read free', tests: [D] },
  { id: 'W10', file: 'rules-options.cjs', find: 'if (missing.length > 0 || extra.length > 0) add(', replace: 'if (false) add(', why: 'a dropped usage line passes', tests: [D] },
  { id: 'W11', file: 'rules-options.cjs', find: 'if (u && !approx(u.quantity, quantity, 1e-9)) add(', replace: 'if (false) add(', why: 'a raised cap passes under the old quantity', tests: [D] },
  { id: 'W12', file: 'rules-options.cjs', find: "if (!line) add('OPTION_PRICE_LINE_MISSING'", replace: "if (false) add('OPTION_PRICE_LINE_MISSING'", why: 'an SKU without a register line passes', tests: [D] },
  { id: 'W13', file: 'rules-commands.cjs', find: "if (!GROUP.has(lower(targetOf(d)))) add('DELETE_TARGET'", replace: "if (false) add('DELETE_TARGET'", why: 'a delete of another group passes', tests: [D, SH] },
  { id: 'W14', file: 'rules-commands.cjs', find: '|| d.st.orElse)', replace: ')', why: 'a delete behind || passes', tests: [D, SH] },
  { id: 'W15', file: 'rules-script.cjs', find: "if (kind(d.st.block) !== 'try') add('SCRIPT_DELETE_NOT_WRAPPED'", replace: "if (false) add('SCRIPT_DELETE_NOT_WRAPPED'", why: 'an unwrapped delete in the script passes', tests: [D] },
  { id: 'W16', file: 'rules-script.cjs', find: 'if (!finalOk) add(', replace: 'if (false) add(', why: 'no final group delete passes', tests: [D] },
  { id: 'W17', file: 'rules-script.cjs', find: "isOther(d, 'set-content', 'out-file', 'add-content')", replace: 'true', why: 'no persistent alarm file passes', tests: [D] },
  { id: 'W18', file: 'rules-markdown.cjs', find: "if (unknown.length > 0) add('MARKDOWN_AMOUNT_UNKNOWN'", replace: "if (false) add('MARKDOWN_AMOUNT_UNKNOWN'", why: 'an unknown dollar amount in the markdown passes', tests: [MD] },
  { id: 'W19', file: 'rules-markdown.cjs', find: 'for (const l of shown) if (!json.has(l)) add(', replace: 'for (const l of shown) if (false) add(', why: 'a foreign command line in a code block passes', tests: [MD] },
  // Third review (N1 to N16): the guards of the closed shapes, the named second-line rules, the caps and the markdown comparison.
  { id: 'N01', file: 'shapes.cjs', find: "if (guarded === 0) add('DISARM_MISSING'", replace: "if (false) add('DISARM_MISSING'", why: 'a plan without a disarm passes', tests: [R4C] },
  { id: 'N02', file: 'shapes.cjs', find: "if (guarded > 1) add('DISARM_DUPLICATE'", replace: "if (false) add('DISARM_DUPLICATE'", why: 'a second guarded disarm passes', tests: [R4C] },
  { id: 'N03', file: 'shapes.cjs', find: "else if (name !== 'verification') add('DISARM_MISPLACED'", replace: "else if (false) add('DISARM_MISPLACED'", why: 'a guarded disarm outside verification passes', tests: [R4C] },
  { id: 'N04', file: 'shapes.cjs', find: "if (shapeOf(line) !== 'disarm') add('DISARM_UNGUARDED'", replace: "if (false) add('DISARM_UNGUARDED'", why: 'an unguarded disarm passes', tests: [R4C] },
  { id: 'N05', file: 'shapes.cjs', find: "if (at >= 0) add('SECTION_SHAPE_SEQUENCE'", replace: "if (false) add('SECTION_SHAPE_SEQUENCE'", why: 'reviewed lines in another order pass', tests: [R4C] },
  { id: 'N06', file: 'shapes.cjs', find: "if (id === null) add('UNKNOWN_STATEMENT_SHAPE'", replace: "if (false) add('UNKNOWN_STATEMENT_SHAPE'", why: 'an unknown statement passes', tests: [R4C] },
  { id: 'N07', file: 'shapes.cjs', find: "if (shapeOf(alarmParam) !== 'param-alarm' ||", replace: 'if (false ||', why: 'a missing or changed alarm parameter passes', tests: [R4C, 'r4-gaps.test.cjs'] },
  { id: 'N08', file: 'rules-commands.cjs', find: "if (seen.has(name)) add('DUPLICATE_OPTION'", replace: "if (false) add('DUPLICATE_OPTION'", why: 'a repeated option passes', tests: [R4C] },
  { id: 'N09', file: 'rules-commands.cjs', find: "if (at.length > 1) add('GUARD_REDEFINED'", replace: "if (false) add('GUARD_REDEFINED'", why: 'a guard defined twice passes', tests: [R4C] },
  { id: 'N10', file: 'rules-commands.cjs', find: "if (use >= 0 && use < at[0]) add('GUARD_REDEFINED'", replace: "if (false) add('GUARD_REDEFINED'", why: 'a guard used before its definition passes', tests: [R4C] },
  { id: 'N11', file: 'rules-commands.cjs', find: "if (assigned.has(first) || !placeholder) add('LEASE_VARIABLE_REASSIGNED'", replace: "if (false) add('LEASE_VARIABLE_REASSIGNED'", why: 'a reassigned lease variable passes', tests: [R4C] },
  { id: 'N12', file: 'rules-commands.cjs', find: "if (INDIRECTION.test(d.st.raw)) add('INDIRECTION'", replace: "if (false) add('INDIRECTION'", why: 'an indirection passes', tests: [R4C] },
  { id: 'N13', file: 'rules-commands.cjs', find: "else if (d.st.words.some((w) => w.quoted && destructiveMention(w.text))) add('INDIRECTION'", replace: "else if (false) add('INDIRECTION'", why: 'a string literal that carries a delete passes', tests: [R4C] },
  { id: 'N14', file: 'rules-commands.cjs', find: "const DENY = /^(?:remove-|clear-", replace: "const DENY = /^(?:clear-", why: 'Remove-Item inside parentheses passes (X03)', tests: [R4M] },
  { id: 'N15', file: 'shell.cjs', find: 'if (depth - 1 >= LIMITS.maxBlockDepth) {', replace: 'if (false) {', why: 'no nesting cap in the parser', tests: [R4U] },
  { id: 'N16', file: 'shell.cjs', find: 'if (statements.length >= LIMITS.maxStatements) {', replace: 'if (false) {', why: 'no statement cap in the parser', tests: [R4U] },
  { id: 'N17', file: 'shell.cjs', find: 'if (blocks.length >= LIMITS.maxStatements) {', replace: 'if (false) {', why: 'no block cap in the parser', tests: [R4U] },
  { id: 'N18', file: 'limits.cjs', find: 'if (totalChars > LIMITS.maxTotalChars)', replace: 'if (false)', why: 'no total character budget', tests: [R4U] },
  { id: 'N19', file: 'limits.cjs', find: 'return hasMarkRun(text) ? markRun(path.slice(0, 80)) : null;', replace: 'return null;', why: 'runs of combining marks pass', tests: [R4U] },
  { id: 'N20', file: 'text.cjs', find: 'if (known !== undefined) return known;', replace: '', why: 'every scanner normalises the string again', tests: [R4U] },
  { id: 'N21', file: 'text.cjs', find: 'const MAX_MARK_RUN = 32;', replace: 'const MAX_MARK_RUN = 3200;', why: 'a run of 3200 combining marks passes', tests: [R4U] },
  { id: 'N22', file: 'text.cjs', find: ".replace(/\\p{M}+/gu, '')", replace: '', why: 'a GUID with combining marks passes', tests: [R4M] },
  { id: 'N23', file: 'rules-markdown.cjs', find: 'if (hasMarkRun(markdown)) {', replace: 'if (false) {', why: 'combining marks in the markdown pass', tests: [R4C] },
  { id: 'N24', file: 'markdown-structure.cjs', find: "if (hits !== 1) add('MARKDOWN_STATUS'", replace: "if (false) add('MARKDOWN_STATUS'", why: 'a removed, repeated or reworded status paragraph passes', tests: [R4MD, 'r4-gaps.test.cjs'] },
  { id: 'N25', file: 'markdown-structure.cjs', find: "if (other.length > 0) add('MARKDOWN_STATUS'", replace: "if (false) add('MARKDOWN_STATUS'", why: 'another status line passes', tests: [R4MD] },
  { id: 'N26', file: 'markdown-structure.cjs', find: "if (!head || wanted.some((w) => !head.includes(w))) add('MARKDOWN_HEADER'", replace: "if (false) add('MARKDOWN_HEADER'", why: 'a changed revision line passes', tests: [R4C] },
  { id: 'N27', file: 'markdown-structure.cjs', find: "if (!table || !w || !table.rows[i] || !rowMatches(table.rows[i], w)) add('MARKDOWN_TABLE_MISMATCH'", replace: "if (false) add('MARKDOWN_TABLE_MISMATCH'", why: 'a changed at-a-glance row passes', tests: [R4MD] },
  { id: 'N28', file: 'markdown-structure.cjs', find: "if (!ok) fail('the worst-case component table", replace: "if (false) fail('the worst-case component table", why: 'a changed worst-case table passes', tests: [R4MD] },
  { id: 'N29', file: 'markdown-structure.cjs', find: "if (!field('Instances').startsWith(", replace: "if (false && !field('Instances').startsWith(", why: 'a changed instance count passes', tests: [R4MD] },
  { id: 'N30', file: 'markdown-structure.cjs', find: "if (found.length !== 1 || found[0] !==", replace: "if (false && found.length !== 1 || found[0] !==", why: 'a second recommendation line passes', tests: [R4MD] },
  { id: 'N31', file: 'markdown-structure.cjs', find: "if (found.length === 0 || found.some((d) => d !== expiry)) add(", replace: "if (found.length === 0) add(", why: 'a second, contradicting expiry date passes', tests: [R4MD] },
  { id: 'N32', file: 'markdown-structure.cjs', find: "if (got.length !== want.length || at >= 0) add('MARKDOWN_CODE_ORDER'", replace: "if (got.length !== want.length) add('MARKDOWN_CODE_ORDER'", why: 'reordered code lines pass', tests: [R4MD] },
  { id: 'N33', file: 'markdown-structure.cjs', find: "if (hit) add('MARKDOWN_CLAIM'", replace: "if (false) add('MARKDOWN_CLAIM'", why: 'a claim in the prose passes', tests: [R4MD] },
  { id: 'N34', file: 'rules-hygiene.cjs', find: "if (key && PROTOTYPE_KEYS.has(text)) add('PROTOTYPE_KEY'", replace: "if (false) add('PROTOTYPE_KEY'", why: 'an own __proto__ key passes', tests: [R4M] },
  { id: 'N35', file: 'rules-hygiene.cjs', find: "if (!allowed.includes(key)) add('UNKNOWN_KEY'", replace: "if (false) add('UNKNOWN_KEY'", why: 'an undocumented key passes', tests: [R4M] },
  { id: 'N36', file: 'rules-hygiene.cjs', find: "!PLACEHOLDER_BODY.test(text)) add('PLACEHOLDER_VALUE'", replace: "false) add('PLACEHOLDER_VALUE'", why: 'a placeholder with a value passes', tests: [R4M] },
  // The four survivors of the review (X16, X20, X22) and the redundant counter (X08) are killed by R4M tests; X01 and X08 are equivalent and not listed.
  { id: 'N37', file: 'rules-prices.cjs', find: "if (r.includedInTotals !== true) add('RESOURCE_PRICED_NO_LINE'", replace: "if (false) add('RESOURCE_PRICED_NO_LINE'", why: 'a priced resource kept out of the totals passes (X16)', tests: [R4M] },
  { id: 'N38', file: 'rules-plan.cjs', find: " || !after((d) => d.kind === 'other' && d.name === 'throw' && !d.quoted)) add('ARMING_TRIGGER_NOT_CHECKED'", replace: ") add('ARMING_TRIGGER_NOT_CHECKED'", why: 'a registered-trigger check that does not throw passes (X20)', tests: [R4M] },
  { id: 'N39', file: 'rules-script.cjs', find: "if (stop < 0 || stop > firstDelete) add('SCRIPT_NO_STOP'", replace: "if (stop < 0) add('SCRIPT_NO_STOP'", why: 'ErrorActionPreference Stop after the first delete passes (X22)', tests: [R4M] },
  ...capMutants()
];

// Systematic: every numeric cap of limits.cjs is raised a thousand times; a test must fail for each one.
function capMutants() {
  const CAP_TESTS = { maxMarkdownLength: [LI, 'hostile-bounds-md.test.cjs'], maxJsonBytes: [LI, 'cli.test.cjs'], maxDepth: [LI], maxNodes: [LI], maxStringLength: [LI], maxTotalChars: [R4U], maxBlockDepth: [R4U], maxStatements: [R4U] };
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'limits.cjs'), 'utf8');
  const line = /Object\.freeze\(\{([^}]*)\}\)/.exec(source)[1];
  return [...line.matchAll(/(\w+): (\d+)/g)].map(([, key, value]) => ({
    id: `L-${key}`, file: 'limits.cjs', find: `${key}: ${value}`, replace: `${key}: ${value}000`, why: `the cap ${key} is raised a thousand times`, tests: CAP_TESTS[key]
  }));
}

module.exports = { MUTANTS };
