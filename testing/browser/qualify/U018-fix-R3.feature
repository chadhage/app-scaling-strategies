Feature: U018 second fix (review R3): an append-only way to add a qualified Edge major, plus larger timeouts and the CLI catch
  Local, synthetic, offline; the machine scenario runs only in tests\qualify.machine.test.cjs, outside the coverage run.
  qualified.json stays sealed ([156], byte-identical); qualified.addendum.jsonl is a NEW append-only file next to it.

  Scenario: N1 A new major is appended to the addendum and nothing else changes
    Given a passing --requalify report of a major above the sealed majors (only MAJOR_NOT_QUALIFIED was the failure)
    When addendum.cjs --report <report> runs
    Then the report and the installed Edge are checked again and ONE hash-chained line is written atomically to qualified.addendum.jsonl
    And qualifyEdge() qualifies that major with qualifiedVia "addendum", the sealed major still qualifies with "sealed"
    And every hermetic test and the evidence test stay green, because the evidence test verifies the chain and never the bytes

  Scenario: N1 Every anomaly of the addendum fails closed with its own reason
    Given an edited, deleted, reordered or duplicated earlier line, a wrong anchor, a BOM, CRLF, a blank line, no final line feed,
      an oversized file, a non-ASCII byte, odd keys, a wildcard or range or fractional or sealed or duplicate major, a version of
      another major, a hash that is not 64 lowercase hex digits, a time that is not a real UTC date, or a directory, junction or symlink
    When the qualified list is read
    Then the check fails closed with QUALIFIED_ADDENDUM_INVALID, the sealed major too, and a requalification launches nothing

  Scenario: N1 A report that does not prove the major, or an Edge that is not the one in the report, is refused
    Given a failed, incomplete, forged or foreign report, or an installed Edge with another version, digest or signature
    When addendum.cjs --report runs
    Then it prints one FAIL closed line, exits 1 and writes nothing

  Scenario: N1 The evidence test pins the sealed list and the verifier by hash and accepts any valid chain
    Given a scratch copy of the namespace
    When valid lines are appended the evidence test stays green
    And when an earlier line, the sealed list or addendum.cjs is edited it fails and names the file

  Scenario: N3 One override drives both timeouts
    Given the defaults 240 s for every adapter call and 180 s for the one PowerShell start
    When --timeout-ms, QUALIFY_TIMEOUT_MS or options.timeoutMs is given
    Then the invalid values are refused by name, the shell bound stays below the outer bound, and a timeout of an adapter fails the check (the clock excepted)

  Scenario: N4 The two guard mutants are killed
    Given the organization is folded with NFKC in qualify.cjs, or the version-line pattern loses its line start
    When the tests run
    Then look-alikes of Microsoft Corporation still give PUBLISHER_NOT_MICROSOFT and a test title with "# Real Chromium" is no sighting

  Scenario: N5 A broken stdout is a typed one-line failure whatever the unhandled-rejection mode
    Given a preload that makes the first stdout write throw, in the default, warn and none modes
    When the command line runs
    Then it prints ONE FAIL closed line on stderr and exits 1

  Scenario: N2 Every mutant is accounted for and the outer bound has a named killer
    Given the mutation run with the survivors file in its order
    When mutant M10 removes the outer bound
    Then outer-timeout.test.cjs fails with an assertion that names the adapter, not the harness timeout
