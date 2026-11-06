'use strict';

// U005 mutants of owned.cjs (data for u005-mutate.cjs): { id, file, guard, find (must occur exactly once, LF text), replace, expect }.
// `expect` is a substring of the name of a test that must fail against the mutant.

const f = 'owned.cjs';

module.exports = [
  { id: 'O01', file: f, guard: 'F9 timer cap', find: 'return Math.min(value, MAX_TIMER_MS);', replace: 'return value;', expect: 'F9: timers are capped' },
  { id: 'O02', file: f, guard: 'F9 deadline validation', find: "if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw invalid(", replace: 'if (false) throw invalid(', expect: 'F9: timers are capped' },
  { id: 'O03', file: f, guard: 'F3 deadline race', find: "const timer = clock.setTimeout(() => reject(new LifecycleError('ERR_TIMEOUT', `${label} did not settle within ${limit} ms`)), limit);", replace: 'const timer = null;', expect: 'F3: a list adapter that never settles is raced' },
  { id: 'O04', file: f, guard: 'F3 timer cleared', find: 'const settle = (fn) => (value) => { clock.clearTimeout(timer); fn(value); };', replace: 'const settle = (fn) => (value) => { fn(value); };', expect: 'and the timer is cleared' },
  { id: 'O05', file: f, guard: 'F8 case-insensitive names', find: 'if (found !== undefined && copy[name] === undefined) copy[name] = env[found];', replace: 'void found;', expect: 'F8: process.env itself' },
  { id: 'O06', file: f, guard: 'F8 process.env passed itself', find: 'if (env === process.env) return env;', replace: 'void 0;', expect: 'F8: process.env itself' },
  { id: 'O07', file: f, guard: 'F1 table must contain the caller', find: 'if (!rows.some((row) => Boolean(row) && row.pid === selfPid)) {', replace: 'if (false) {', expect: 'F1: an empty process table' },
  { id: 'O08', file: f, guard: 'helper row excluded', find: 'return rows.filter((row) => !(helper !== null && row.pid === helper && row.ppid === selfPid));', replace: 'return rows;', expect: 'helper rows' },
  { id: 'O09', file: f, guard: 'helper row needs ppid', find: '!(helper !== null && row.pid === helper && row.ppid === selfPid)', replace: '!(helper !== null && row.pid === helper)', expect: 'helper rows' },
  { id: 'O10', file: f, guard: 'F5 protected pids not forwarded', find: 'const protectedIds = identities.filter((item) => item.pid === selfPid || SYSTEM_PIDS.has(item.pid));', replace: 'const protectedIds = [];', expect: 'F5: the caller and system pids' },
  { id: 'O11', file: f, guard: 'F5 system pids not forwarded', find: 'item.pid === selfPid || SYSTEM_PIDS.has(item.pid)', replace: 'item.pid === selfPid', expect: 'F5: the caller and system pids' },
  { id: 'O12', file: f, guard: 'kill identities validated', find: "if (!Array.isArray(identities) || !identities.every((item) => Boolean(item) && isPid(item.pid))) throw invalid(", replace: 'if (false) throw invalid(', expect: 'F5: the caller and system pids' },
  { id: 'O13', file: f, guard: 'F2 unreadable descendant', find: '(owned.has(row.ppid) && row.createdAt === null)', replace: 'false', expect: 'F2: an unreadable descendant' },
  { id: 'O14', file: f, guard: 'F2 below an unverifiable row', find: 'const below = found.has(row.ppid);', replace: 'const below = false;', expect: 'F2: an unreadable descendant' },
  { id: 'O15', file: f, guard: 'F5 ownerPid required', find: "if (!isPid(ownerPid)) throw invalid('ownerPid is required');", replace: 'void 0;', expect: 'F5: ownerPid is required' },
  { id: 'O16', file: f, guard: 'F5 foreign owner refused', find: "if (ownerPid !== adapters.selfPid) throw new LifecycleError('ERR_FOREIGN_OWNER', 'ownerPid must be the calling process itself');", replace: 'void 0;', expect: 'F5: ownerPid is required' },
  { id: 'O17', file: f, guard: 'F5 system root refused', find: "if (SYSTEM_PIDS.has(rootPid)) throw new LifecycleError('ERR_PROTECTED_ROOT', 'system processes can never be an owned tree');", replace: 'void 0;', expect: 'F5: ownerPid is required' },
  { id: 'O18', file: f, guard: 'baseline children are not new roots', find: '!this.before.has(keyOf(item))', replace: 'true', expect: 'records exactly the new children' },
  { id: 'O19', file: f, guard: 'unreadable new root is unverifiable', find: 'if (row.createdAt === null) {', replace: 'if (false) {', expect: 'a new direct child with an unreadable creation time' },
  { id: 'O20', file: f, guard: 'F2 unverifiable merged on every table', find: 'for (const item of unverifiableOf(table, [...this.entries.values()])) if (!this.hidden.has(item.pid)) this.hidden.set(item.pid, item);', replace: 'void 0;', expect: 'F2: the owned tree counts an unverifiable descendant' },
  { id: 'O21', file: f, guard: 'F4 listed after kill is a survivor', find: "else if (listed(item)) survivors.push({ ...identity, reason: how === 'killed' ? 'still-listed-after-kill' : 'listed-after-reported-gone' });", replace: 'else if (false) survivors.push(identity);', expect: 'F4: a lying kill that lands exactly on the deadline' },
  { id: 'O22', file: f, guard: 'F4 no table means unconfirmed', find: 'else if (fresh === null) unconfirmed.push(identity);', replace: 'else if (false) unconfirmed.push(identity);', expect: 'F4: terminated is claimed only after' },
  { id: 'O23', file: f, guard: 'clean counts listed unverifiable', find: ' && !unverifiable.some((item) => item.stillListed);', replace: ';', expect: 'F2: the owned tree counts an unverifiable descendant' },
  { id: 'O24', file: f, guard: 'clean counts blocking refusals', find: ' && blocking.length === 0', replace: '', expect: 'a protected or unverifiable refusal' },
  { id: 'O25', file: f, guard: 'history keeps terminated', find: "else if (how === 'killed' || this.history.has(keyOf(item))) terminated.push(identity);", replace: "else if (how === 'killed') terminated.push(identity);", expect: 'a real kill is confirmed by the table' },
  { id: 'O26', file: f, guard: 'identity mismatch is not blocking', find: "const blocking = refused.filter((item) => item.reason !== 'identity-mismatch' && stillThere(item));", replace: 'const blocking = refused.filter((item) => stillThere(item));', expect: 'pid reuse between the snapshot and the kill' },
  { id: 'O27', file: f, guard: 'F3 outer race over terminateOwned', find: "return await bounded(this.adapters.clock, limit + SLACK_MS, 'terminateOwned', () => tree.terminateOwned(snapshot, { timeoutMs: limit, adapters: this.adapters }));", replace: 'return await tree.terminateOwned(snapshot, { timeoutMs: limit, adapters: this.adapters });', expect: 'F3: a sleep that never settles' },
  { id: 'O28', file: f, guard: 'terminate really kills', find: 'const mustKill = table === null || [...this.entries.keys()].some((pid) => table.some((row) => row.pid === pid));', replace: 'const mustKill = false;', expect: 'a real kill is confirmed by the table' },
  { id: 'O29', file: f, guard: 'F9 terminate deadline validated', find: "const killLimit = checkMs(options.timeoutMs === undefined ? DEFAULT_TERMINATE_MS : options.timeoutMs, 'timeoutMs');", replace: 'const killLimit = options.timeoutMs === undefined ? DEFAULT_TERMINATE_MS : options.timeoutMs;', expect: 'F9: terminate rejects invalid deadlines' },
  { id: 'O30', file: f, guard: 'protected refusal is an error outcome', find: "outcome: 'error', detail: 'refused: protected pid'", replace: "outcome: 'killed', detail: 'refused: protected pid'", expect: 'F5: the caller and system pids' },
  { id: 'O31', file: f, guard: 'helper pid captured', find: 'helper = helperPid();', replace: 'helper = null;', expect: 'helper rows' },
  { id: 'O32', file: f, guard: 'roots recorded', find: 'this.rootList.push(identityOf(row));', replace: 'void 0;', expect: 'records exactly the new children' },
  { id: 'O33', file: f, guard: 'gone by the fresh table is terminated', find: 'if (fresh !== null && !listed(item)) terminated.push(identityOf(item));', replace: 'if (false) terminated.push(identityOf(item));', expect: 'F3: a sleep that never settles' },
  { id: 'O34', file: f, guard: 'descendants refreshed', find: 'if (this.entries.size > 0) {',   replace: 'if (false) {', expect: 'records exactly the new children' },
  { id: 'O35', file: f, guard: 'table must be an array', find: "if (!Array.isArray(rows)) throw new LifecycleError('ERR_ADAPTER', 'list adapter must return an array');", replace: 'void 0;', expect: 'F1: a truncated table' },
  { id: 'O36', file: f, guard: 'a surviving identity is retried in a later pass', find: 'for (let pass = 1; pass < MAX_KILL_PASSES && result.survivors.length > 0; pass += 1) {', replace: 'for (let pass = 1; false; pass += 1) {', expect: 'retried by identity in a later pass' },
  { id: 'O37', file: f, guard: 'what an earlier pass terminated stays terminated', find: 'result = mergePasses(result, await this.pass(left - KILL_RETRY_MS));', replace: 'result = await this.pass(left - KILL_RETRY_MS);', expect: 'retried by identity in a later pass' },
  { id: 'O38', file: f, guard: 'the retries are bounded', find: 'pass < MAX_KILL_PASSES && result.survivors.length > 0', replace: 'pass < 100 && result.survivors.length > 0', expect: 'retried a bounded number of times' },
];
