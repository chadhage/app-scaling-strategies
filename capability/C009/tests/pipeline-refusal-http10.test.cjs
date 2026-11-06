'use strict';

const { registerInProcess } = require('./pipeline-matrix.cjs');

// The HTTP/1.0 keep-alive framing of the F1b matrix (rev-C017 F12): EVERY request of every shape is an HTTP/1.0 request with
// Connection: keep-alive (a legal pipeline). Node applies maxRequestsPerSocket to HTTP/1.1 only, so nothing may depend on it. Node
// ignores Expect in HTTP/1.0 and rejects a chunked body there as a parse error, so two rows are skipped (see FRAMINGS in
// pipeline-rows.cjs). The other framings are pipeline-refusal.test.cjs and pipeline-refusal-mixed.test.cjs.
registerInProcess(1);
