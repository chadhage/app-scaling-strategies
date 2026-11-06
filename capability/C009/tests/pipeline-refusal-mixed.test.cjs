'use strict';

const { registerInProcess } = require('./pipeline-matrix.cjs');

// The mixed framing of the F1b matrix (rev-C017 F12): the refusal and what stands before it are HTTP/1.1, what stands behind the refusal
// is plain HTTP/1.0 (which Node answers with a close): the guard is the mark of the socket and never depends on the HTTP version of
// the request behind. The other framings are pipeline-refusal.test.cjs and pipeline-refusal-http10.test.cjs.
registerInProcess(2);
