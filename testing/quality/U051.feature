Feature: Read approval packet JSON without changing its meaning
  Scenario: Preserve the accepted packet and transparently read one leading byte order mark
    Given the accepted revision 4 packet and a fixed observation date
    When the actual CLI reads the plain file or the same file with one leading U+FEFF
    Then both commands exit 0 with the same findings
    And the byte order mark is removed before the input size check

  Scenario: Refuse every repeated decoded object key
    Given JSON whose last values form an otherwise accepted packet
    When a root, authority, option, note, or wrapper key is repeated
    Then the actual CLI exits 1 with DUPLICATE_JSON_KEY
    And a one-line finding names the decoded key
    And independent objects may reuse the same key

  Scenario: Reuse the documented root schema
    Given an otherwise accepted packet
    When an undocumented root key is added
    Then the actual CLI exits 1 with UNKNOWN_KEY
    And every documented root field remains accepted

  Scenario: Bound the original JSON token stream
    Given JSON text before repeated keys have been collapsed
    When a nesting, value, string, character, or combining-run cap is exceeded
    Then the reader returns the existing typed bound
    And a malformed stream is not silently accepted
    And a result wrapper may use the existing larger markdown limit

  Scenario: Validate a packet outside the CLI
    Given a caller has parsed a packet
    When the caller supplies its original JSON text to validatePacket
    Then repeated decoded keys in that text are refused
    And callers without the original text cannot detect keys already collapsed by parsing
