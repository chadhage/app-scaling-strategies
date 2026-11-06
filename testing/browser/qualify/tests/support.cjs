'use strict';

// Test tooling (not production code): builds the injected adapter set of qualifyEdge().
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const MS_SUBJECT = 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US';
const MS_ISSUER = 'CN=Microsoft Code Signing PCA 2024, O=Microsoft Corporation, C=US';
const SHA = 'ab'.repeat(32);

function fixtureAdapters(overrides = {}) {
  return {
    candidates: () => [EDGE],
    statFile: () => ({ exists: true, isFile: true, size: 4096, mtimeMs: 1000 }),
    sha256: () => SHA,
    signature: () => ({ status: 'Valid', subject: MS_SUBJECT, issuer: MS_ISSUER, thumbprint: 'CD'.repeat(20) }),
    fileVersion: () => '156.0.4314.58',
    readQualified: () => ({ schemaVersion: 1, qualifiedMajors: [156] }),
    now: () => new Date('2026-11-05T12:00:00.000Z'),
    ...overrides,
  };
}

function never() {
  return new Promise(() => {});
}

module.exports = { EDGE, MS_SUBJECT, MS_ISSUER, SHA, fixtureAdapters, never };
