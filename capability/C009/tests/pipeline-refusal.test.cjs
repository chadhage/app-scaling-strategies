'use strict';

const { registerInProcess } = require('./pipeline-matrix.cjs');

// Review finding F1b: a refusal that is not the first request of its connection, and a refusal decided after an await, must end the
// connection exactly like a first one: what stands behind it never runs (no state change, no revision, no audit record of an applied
// command), what stands before it is answered once. Every refusal of refusal-rows.cjs (the typed ones and the three that Node would
// answer by itself), in six shapes (position 0, 1 and 2, one TCP write or two) with a permitted pool.resize pipelined behind the refusal.
// THIS FILE is the HTTP/1.1 framing; pipeline-refusal-http10.test.cjs (every request HTTP/1.0 with keep-alive) and
// pipeline-refusal-mixed.test.cjs (an HTTP/1.0 mutation behind an HTTP/1.1 refusal) are the other two thirds of the matrix that was one
// 605-cell file (review F9c: a file of that cost does not fit the 60 s of the runner on a loaded machine). The cells themselves are
// unchanged; pipeline-matrix.cjs checks them.
registerInProcess(0);
