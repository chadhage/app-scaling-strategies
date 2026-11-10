'use strict';

// Nothing runs behind a refusal, in THIS process, part 5 of 5 (see matrix-kit.cjs): the THIRD HOLE (rev-C059 N1). A Node-own answer
// decided at PARSE time (unknown Expect, parse error, no Host, CONNECT) with TWO or THREE legitimate requests, or a mutation, before it:
// the earlier requests are answered in order, then the refusal, then the connection is closed. HTTP/1.1 and HTTP/1.0 where the shape
// exists.
const { test } = require('node:test');
const { nodeOwn, thirdHole, useMatrix } = require('./matrix-kit.cjs');

const m = useMatrix();

for (const x of nodeOwn(m)) {
  test(`third hole, ${x.name}: [G][G][X], [G][G][G][X], [G][G][X][G], [POST][G][X] answer the earlier requests in order, then the refusal, then close`, m.cell(() => thirdHole(m, x)));
}
