'use strict';

const path = require('node:path');
const { test } = require('node:test');
const { startChild } = require('./resource-harness.cjs');
const { ROWS } = require('./refusal-rows.cjs');
const { SHAPES, FRAMINGS, wanted } = require('./pipeline-rows.cjs');
const { checkCells } = require('./pipeline-matrix.cjs');

// Review finding F1b against a server in a SEPARATE process: the same refusal rows, shapes and framings (HTTP/1.0 keep-alive, an HTTP/1.0
// mutation behind an HTTP/1.1 refusal: rev-C017 F12) as the three pipeline-refusal files, the requests sent from this process over real
// loopback sockets, the state read back from the server process. The server process holds ONE app per row and ONE process serves every
// row (a process start per row did not fit the 60 s of the suite command at 8 in parallel); the shapes of a row run one after the other
// against its app (the effects add up: revision and pool size are compared with the state before each exchange).
// COST (review F9c, L-0204): the in-process files above run every cell of every row; this file runs, against the other process, the cells
// that differ in what the server process sees: the refusal first (the pair of the card), after an earlier mutation, after two GETs, cut
// into two TCP writes, and in both HTTP/1.0 framings the refusal first and behind a GET. A process matrix of the 600 cells cost 15 s.
const CHILD = path.join(__dirname, 'pipeline-child.cjs');
const CELLS = [
  [0, ['R M7', 'M6 R M7', 'G G R M7', 'G R | M7']],
  [1, ['R M7', 'G R M7']],
  [2, ['R M7', 'G R M7']]
];

async function checkRow(child, row) {
  const { port, tokens, extra } = await child.ask({ type: 'open', code: row.code }, `opened:${row.code}`, 30000);
  const state = async () => {
    const { revision, size, applied } = await child.ask({ type: 'state', code: row.code }, `state:${row.code}`, 30000);
    return { revision, size, applied };
  };
  for (const [framingIndex, names] of CELLS) {
    const framing = FRAMINGS[framingIndex];
    if ((framing.skips || []).includes(row.code)) continue;
    await checkCells({ row, framing, shapes: names.map((name) => SHAPES.find((shape) => shape.name === name)), port, tokens, extra, state });
  }
}

// Four rows at a time against the one server process.
test('every refusal row against a server in a separate process: nothing behind the refusal runs in any shape or framing', { concurrency: 4, timeout: 55000 }, async (t) => {
  const child = startChild({ heapMb: 128, hardMs: 65000, script: CHILD, args: [] });
  try {
    await child.receive('ready', 30000);
    await Promise.all(ROWS.filter((row) => wanted(`${row.code} [R M7] HTTP/1.1`)).map((row) => t.test(`${row.code} in a separate server process: nothing behind the refusal runs in any shape or framing`, { timeout: 50000 }, () => checkRow(child, row))));
  } finally {
    child.stop();
  }
});
