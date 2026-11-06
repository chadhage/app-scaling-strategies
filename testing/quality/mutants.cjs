'use strict';
// The mutants of the mutation run (tooling, not production code). Each one removes or inverts ONE guard of a production file; the listed fast test files
// must fail on it. M-numbers are the mutants of the second independent review (rewritten for the revision 3 code, which no longer has the old lines);
// W-numbers are mutants of the guards added in revision 3.
const D = 'rules-direct.test.cjs';
const SH = 'shell.test.cjs';
const TI = 'text-ident.test.cjs';
const LI = 'limits.test.cjs';
const MD = 'markdown.test.cjs';

const MUTANTS = [
  { id: 'M01', file: 'rules-commands.cjs', find: 'return pin && own;', replace: 'return pin || own;', why: 'a delete needs only one of G2 and G3', tests: [SH, D] },
  { id: 'M02', file: 'rules-commands.cjs', find: 'for (let j = prev + 1; j < k; j += 1) {', replace: 'for (let j = prev + 1; j < list.length; j += 1) {', why: 'guards placed after the delete count', tests: [SH, D] },
  { id: 'M03', file: 'rules-commands.cjs', find: 'if (!isPrefix(g.st.blocks, d.st.blocks)) continue;', replace: '', why: 'a guard in a block that does not enclose the delete counts', tests: [SH, D] },
  { id: 'M04', file: 'rules-prices.cjs', find: "line.unitPrice > 0)) add('PRICE_NOT_POSITIVE'", replace: "line.unitPrice >= 0)) add('PRICE_NOT_POSITIVE'", why: 'a zero returned price accepted', tests: [D] },
  { id: 'M05', file: 'rules-options.cjs', find: 'o.teardownLatencyHours >= 1', replace: 'o.teardownLatencyHours >= 0', why: 'no latency hour needed', tests: [D] },
  { id: 'M06', file: 'rules-options.cjs', find: 'else if (o.spendCeilingUsd !== ceilingFor(total))', replace: 'else if (false)', why: 'ceiling rule disabled', tests: [D] },
  { id: 'M08', file: 'ident.cjs', find: '[0-9a-f]{12}/i;', replace: '[0-9a-f]{12}/;', why: 'GUID pattern case sensitive', tests: [TI] },
  { id: 'M09', file: 'ident.cjs', find: 'return HARD.test(t) || ENFORCED.test(words(t));', replace: 'return !(HARD.test(t) || ENFORCED.test(words(t)));', why: 'hard rule inverted', tests: [TI] },
  { id: 'M10', file: 'rules-decisions.cjs', find: 'else if (ageDays(price, prepared) > MAX_PRICE_AGE_DAYS)', replace: 'else if (ageDays(price, prepared) >= MAX_PRICE_AGE_DAYS)', why: 'stale at exactly 7 days against the packet date', tests: [D] },
  { id: 'M10b', file: 'rules-decisions.cjs', find: 'else if (ageDays(price, now) > MAX_PRICE_AGE_DAYS)', replace: 'else if (ageDays(price, now) >= MAX_PRICE_AGE_DAYS)', why: 'stale at exactly 7 days against the clock', tests: [D] },
  { id: 'M11', file: 'rules-decisions.cjs', find: "if (found.some((d) => d.default !== 'no'))", replace: "if (found.some((d) => d.default === 'yes'))", why: 'only a literal yes fails', tests: [D] },
  { id: 'M13', file: 'validate-packet.cjs', find: 'return result.ok ? 0 : 1;', replace: 'return 0;', why: 'exit code always 0', tests: [LI] },
  { id: 'M15', file: 'rules-commands.cjs', find: 'if (!NO_SUBSCRIPTION.has(d.sub) && !PIN.has(lower(sub)))', replace: "if (!NO_SUBSCRIPTION.has(d.sub) && d.sub !== 'group delete' && !PIN.has(lower(sub)))", why: 'az group delete exempt from --subscription', tests: [D, SH] },
  { id: 'M19', file: 'rules-prices.cjs', find: '\\bno (?:separate |extra )?(?:charge|cost)\\b|', replace: '', why: 'no charge expected is not a zero claim', tests: [D] },
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
  { id: 'W06', file: 'ident.cjs', find: '[0-9a-f]{8}[-.]{0,3}', replace: '[0-9a-f]{8}[-.]{0,0}', why: 'a GUID with dot or dash separators between groups passes', tests: [TI] },
  { id: 'W07', file: 'text.cjs', find: ".replace(/[\\s*`~_\\\\]+/g, '')", replace: ".replace(/[*`~_\\\\]+/g, '')", why: 'a GUID split by a line break or spaces passes', tests: [TI] },
  { id: 'W08', file: 'ident.cjs', find: ".replace(/ ?[[({<] ?at ?[\\])}>] ?/gi, '@')", replace: '', why: 'an e-mail written [at] passes', tests: [TI] },
  { id: 'W09', file: 'rules-prices.cjs', find: "if (zero || !isStr(text)) add('ZERO_COST_UNSOURCED'", replace: "if (!isStr(text)) add('ZERO_COST_UNSOURCED'", why: 'a priced row may read free', tests: [D] },
  { id: 'W10', file: 'rules-options.cjs', find: 'if (missing.length > 0 || extra.length > 0) add(', replace: 'if (false) add(', why: 'a dropped usage line passes', tests: [D] },
  { id: 'W11', file: 'rules-options.cjs', find: 'if (u && !approx(u.quantity, quantity, 1e-9)) add(', replace: 'if (false) add(', why: 'a raised cap passes under the old quantity', tests: [D] },
  { id: 'W12', file: 'rules-options.cjs', find: "if (!line) add('OPTION_PRICE_LINE_MISSING'", replace: "if (false) add('OPTION_PRICE_LINE_MISSING'", why: 'an SKU without a register line passes', tests: [D] },
  { id: 'W13', file: 'rules-commands.cjs', find: "if (!GROUP.has(lower(targetOf(d)))) add('DELETE_TARGET'", replace: "if (false) add('DELETE_TARGET'", why: 'a delete of another group passes', tests: [D, SH] },
  { id: 'W14', file: 'rules-commands.cjs', find: '|| d.st.orElse)', replace: ')', why: 'a delete behind || passes', tests: [D, SH] },
  { id: 'W15', file: 'rules-script.cjs', find: "if (kind(d.st.blocks[d.st.blocks.length - 1]) !== 'try') add('SCRIPT_DELETE_NOT_WRAPPED'", replace: "if (false) add('SCRIPT_DELETE_NOT_WRAPPED'", why: 'an unwrapped delete in the script passes', tests: [D] },
  { id: 'W16', file: 'rules-script.cjs', find: 'if (!finalOk) add(', replace: 'if (false) add(', why: 'no final group delete passes', tests: [D] },
  { id: 'W17', file: 'rules-script.cjs', find: "isOther(d, 'set-content', 'out-file', 'add-content')", replace: 'true', why: 'no persistent alarm file passes', tests: [D] },
  { id: 'W18', file: 'rules-markdown.cjs', find: "if (unknown.length > 0) add('MARKDOWN_AMOUNT_UNKNOWN'", replace: "if (false) add('MARKDOWN_AMOUNT_UNKNOWN'", why: 'an unknown dollar amount in the markdown passes', tests: [MD] },
  { id: 'W19', file: 'rules-markdown.cjs', find: 'for (const l of shown) if (!json.has(l)) add(', replace: 'for (const l of shown) if (false) add(', why: 'a foreign command line in a code block passes', tests: [MD] }
];

module.exports = { MUTANTS };
