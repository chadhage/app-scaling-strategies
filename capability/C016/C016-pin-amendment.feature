Feature: C016 pins of accepted C015 test bytes have an owned, chained, append-only amendment path
  U019 is a zero-credit unblock item that publishes under the original C016 / D card. It adds tests, tooling, evidence and documents only.
  dependency-pins.json is never rewritten: it stays the immutable history of the accepted C001, C002 and C015 bytes (observedHead dcf698aa).
  A numbered chain dependency-pins-addendum-N.json is the current authority. It may supersede only a pinned C015 test file, one record at a time,
  naming the exact bytes it supersedes and the exact bytes that replace them. Git-history canonical bytes stay on the sealed record.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario: The K-C015 pin edit is rejected today because the pins have no amendment path
    Given a scratch copy of C001, C002, C015 and C016 that is not the repository tree
    And the retained v1 integrity test
    When the one-line K-C015 edit of C015 tests\surface.test.cjs is applied to the scratch copy
    Then the v1 integrity test fails at the raw byte check of that file (6034 bytes expected, 6036 found)
    And the same scratch copy without the edit passes

  Scenario: Without an addendum the sealed raw bytes are the only accepted bytes
    Given the sealed records and no addendum
    When a pinned file holds any other bytes
    Then the check rejects it naming the path, the expected and the actual SHA-256

  Scenario: The exact K-C015 replacement of surface.test.cjs is accepted
    Given an addendum that supersedes 89834f62 of C015 tests\surface.test.cjs with a8deb9cc, status authorized
    When the file holds the sealed bytes or exactly the replaced bytes
    Then the check accepts it
    And the replaced bytes are the Git-history bytes at observedHead with line 70 reading the archived publisher snapshot, converted to CRLF
    And the replaced record keeps its CRLF count and its Git canonical bytes are the LF form of the replaced bytes

  Scenario: Any other change to surface.test.cjs is rejected
    Given the same addendum
    When the file holds any other bytes, including the replaced line with an LF ending
    Then the check rejects it naming the path and both accepted hashes

  Scenario: A change to any other pinned C015 test file is rejected even with a valid addendum
    Given a valid addendum for surface.test.cjs
    When any of the other twelve pinned C015 test files changes by one byte
    Then the check rejects it, and the unchanged files pass

  Scenario: Only pinned C015 test files can be superseded
    When an addendum supersedes a C015 production file, a C001 or C002 file, an unpinned file or a path outside the pins
    Then the chain is rejected with AMENDMENT_PATH_NOT_ALLOWED, with or without an addendum

  Scenario: A modified addendum is rejected
    When an addendum changes its schema, card, sequence, base, chain link, key set, statuses, record fields or hashes
    Then the chain is rejected
    And an addendum whose LF hash differs from the trusted prefix pinned by the integrity test is rejected

  Scenario: A missing addendum is rejected
    When addendum numbers have a gap, or a trusted addendum is absent
    Then the chain is rejected
    And a replaced file without an addendum is rejected

  Scenario: The chain is append-only
    Given addendum 1 supersedes the sealed bytes of a file
    When addendum 2 supersedes the same file
    Then it must name the bytes addendum 1 produced, never the sealed bytes again
    And it must name the LF hash of addendum 1 as its previous link
    And the sealed bytes are no longer accepted

  Scenario: Authorized and applied statuses differ only before the edit
    When a step is authorized, the file may still hold the superseded bytes until the edit is made
    Then an applied step accepts the replaced bytes only

  Scenario: The chain holds in a CRLF checkout
    When the addenda are read with CRLF line endings
    Then the chain resolves to the same tip because links use the LF-canonical hash

  Scenario: After the K-C015 edit C016 and its consumers are green
    Given a scratch copy with the exact K-C015 edit applied
    When the C016 integrity test and the C015 consumer suites run
    Then they pass and the real C015 tree is never touched
