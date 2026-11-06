Feature: U018 review fix R2 (findings F1 to F7 of the independent review of commit 4bbf849e)
  The Edge qualification must not accept a look-alike publisher, must not call a requalification passed when nothing ran,
  must say its verdict on one stderr line, must read the binary twice and must refuse unsafe --json targets before it starts.

  Scenario: F1 a BOM in the organization is part of the name (tests\subject-lookalike.test.cjs)
    Given a Valid signature whose organization is U+FEFF followed by "Microsoft Corporation" in the plain, hex-escaped or quoted form
    When the subject is parsed and the Edge is qualified
    Then the organization keeps the U+FEFF, differs from "Microsoft Corporation" and fails closed with PUBLISHER_NOT_MICROSOFT
    And no format character, joiner, zero-width character, variation selector or look-alike letter is stripped or normalized
    And Unicode whitespace around an attribute type is refused, only the ASCII space and tab around a component are insignificant

  Scenario: F2 a requalification that ran nothing is not a pass (tests\requalify-verdict.test.cjs, tests\requalify-counts.test.cjs)
    Given isolated suites whose tests are all skipped, all todo, partly skipped, absent, or that print no "Real Chromium" line
    When the requalification judges them
    Then a suite passes only when pass equals tests, pass is above zero, nothing is skipped, todo, cancelled or failed, node exited 0
    And it printed the browser version line of the qualified Edge, and a missing line is BROWSER_VERSION_MISSING
    And the reason names each suite with the number of tests that passed

  Scenario: F3 stderr is one verdict line (tests\cli-line.test.cjs)
    Given a PowerShell failure whose message has several lines and is repeated by two reasons
    Then stderr is a single line with collapsed whitespace and the shared text once, and the JSON keeps the full text
    And a report that cannot be written is the same single line, followed by the write error

  Scenario: F4 the binary is read twice (tests\qualify-recheck.test.cjs)
    Given a swap that restores size and modification time between the reads
    Then the SHA-256 read after the signature check differs from the first and the check fails with EDGE_CHANGED_DURING_CHECK

  Scenario: F5 the suite has no hang and no blind spot (tests\requalify-tree.test.cjs and per-test timeouts)
    Given a hung suite with a detached grandchild and adapters that never answer
    Then the whole tree is ended and every never-answering test fails in seconds instead of hanging

  Scenario: F6 the --json target is checked before anything runs (tests\cli-target.test.cjs)
    Given reserved device names, trailing dots or spaces, a colon after the drive letter, UNC paths, an existing file or a missing folder
    Then the command exits 2 with one stderr line and nothing is started, also with --requalify

  Scenario: F7 --requalify starts the suites when the only failure is MAJOR_NOT_QUALIFIED (decided, README and requalify-flow tests)
    Given a signed Microsoft binary of a new major
    Then the suites run and the report is the evidence for the card that adds the major
    But an unsigned, foreign, missing, unparsable or changed binary never launches anything
