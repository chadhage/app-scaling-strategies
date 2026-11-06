'use strict';

// Fixture suite for the requalification runner: a test whose TITLE mentions a browser version but that prints no
// diagnostic line, so it never shows that a browser ran.
const test = require('node:test');

test('Real Chromium 156.0.4314.58 is only a title', () => {});
