# U040 evidence: what every archived capture is and the exact command that reproduces it

PowerShell 7, repository root. Every manifest under `red\` and `green\` records its command, the SHA-256 of every input, the exit code and gzip transcripts (written by the shared recorder with flag `wx`: an attempt keeps its name, a failed attempt stays archived). `..\..\evidence-index-addendum-1.json` pins every manifest by SHA-256 and `..\..\tests\u040-evidence.test.cjs` recomputes all of it. `..\..\U040.md` has the commands in prose; this file lists them per capture and states the load rules learned on the shared machine.

## Two generations of captures

S1 (history, retained): `red-01`, `red-02`, `red-03`, `green-01` to `green-04`, `replay-01`, `syntax-01`, `coverage-<file>` (five), `browser-01`, and the failed attempts `fresh-01-archive-lf`, `fresh-02-archive-crlf` and `loop-01-64x8`. They ran on the first versions of five files (`tests\u040-support.cjs`, `tests\u040-node-own.test.cjs`, `README.md`, `U040.md`, `U040.feature`), whose byte-exact copies are under `superseded\`. S2 (final): everything else; every input of an S2 run is the live byte. The verifier accepts S1 only through that one exemption.

## S2: the commands

| capture | command (after `cd` to the repository root) | expected |
| --- | --- | --- |
| `red-04-final-tests-head` | `node --test --test-concurrency=1 capability\C026\tests\u040-pipelining.test.cjs capability\C026\tests\u040-node-own.test.cjs` with the HEAD bytes of `server.cjs` (commit `a52f05e2`, sha256 `22f6db29782e489a5f0c90427f6a970d959802be29d01843fbfd3681c988b5c7`, `superseded\server.cjs.txt`) put in place for the run and the fixed bytes restored afterwards | exit 1, failures on assertions only |
| `red-05-exchange-old-helper` | `node --test --test-concurrency=1 capability\C026\tests\u040-exchange.test.cjs` with the previous helper (`superseded\u040-support.s1.cjs.txt`) in place of `tests\u040-support.cjs` | exit 1, three assertion failures, two controls pass |
| `replay-02-red-unchanged` | the `red-04` command on the final bytes | exit 0, every RED assertion passes |
| `green-05-u040-suites` | `node --test --test-concurrency=1` over `u040-pipelining`, `u040-node-own`, `u040-amendment` and `u040-exchange` `.test.cjs` | exit 0 |
| `green-06-whole-suite-s2` | `node --test --test-concurrency=1` over every `capability\C026\tests\*.test.cjs` except `evidence-final.test.cjs` and `u040-evidence.test.cjs` (they need the addendum that lists the run) | exit 0 |
| `syntax-02` | `node capability\C026\tests\syntax.cjs` | exit 0 |
| `coverage-s2-<file>` (five) | `node --test --test-concurrency=1 --experimental-test-coverage --test-coverage-include=capability/C026/<file> --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85` over the same suites as `green-06`, one command per file | exit 0, every row at or above 85 |
| `browser-02` | `node capability\C026\tests\browser.cjs` (real isolated headless Edge, `CAPTURE_BROWSER_EVIDENCE` unset) | exit 0, `C026 browser GREEN` |
| `fresh-03-archive-lf`, `fresh-04-archive-crlf` | `node capability\C026\tests\u040-fresh-tree.cjs <short empty folder outside the repository> lf` and `... crlf` | exit 0 |
| `loop-02-64x4` | `node capability\C026\tests\u040-loop.cjs 64 4` | exit 0, 64 clean runs |

The verifier: `node --test --test-concurrency=1 capability\C026\tests\u040-evidence.test.cjs capability\C026\tests\evidence-final.test.cjs capability\C026\tests\u040-amendment.test.cjs`.

## Load rules (a saturated shared machine)

- No clock decides a verdict in a test; the node:test timeouts and `boundMs` are hang guards only. The loop is the proof: `u040-loop.cjs` runs the two behaviour suites N times, P at a time, and exits 1 on any run that is not clean.
- Run a loop at NORMAL priority with at most 4 workers and with none of your other captures running (a below-normal loop gets 2 to 4 percent of a core on a saturated machine and times out; 8 workers starve everyone else). `loop-01-64x8` ran 8 at a time on the previous helper and failed one run; its retry `loop-02-64x4` ran 4 at a time. `U040.md` still names the 8-way command of the first attempt; use `64 4` on a shared machine.
- Coverage and the real browser run inside a heavy slot, at normal priority.
- Use a scratch folder with a SHORT path for the fresh-tree runs: the driver refuses a tree whose longest path exceeds 240 characters (`fresh-01` and `fresh-02` hit that guard and are retained).
