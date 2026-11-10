Feature: Evidence caches never trust mutable Buffer identity
  Scenario: A previously verified raw or canonical input changes in place
    Given the accepted 362-file fixture verifies without problems
    When the same input buffer or one of its aliases changes
    Then the same verifier reports exactly the problems a fresh verifier reports

  Scenario: Canonical and inflated digest caches see changed source bytes
    Given raw, CRLF-to-LF and gzip results have already been cached
    When the source buffers change in place without changing their identities
    Then each result is recomputed from the current bytes

  Scenario: Unchanged inputs still reuse one snapshot and expensive results
    Given the same accepted fixture is verified twice unchanged
    Then the second verification needs no additional cryptographic hash or decompression
    And the shared snapshot still reads each of its 362 files once
    And cache reuse validates content against private copied bytes
