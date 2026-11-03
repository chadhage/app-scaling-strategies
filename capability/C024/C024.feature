Feature: C024 bounded synthetic multipart upload fixture
  # Frozen S; one original C024 unit; source parent H005; accepted entry C020.
  # A resource-free, same-memory fixture is not a network or durable upload.

  Background:
    Given the unchanged accepted C020 synthetic-001 profile catalog and version metadata
    And the immutable C024-r1 fixture contains exactly 256 synthetic bytes in four 64-byte parts
    And neither arbitrary user files nor Azure resources are authorized

  Scenario: Inspect explicit accepted part IDs without trusting arrival order
    Given I explicitly start the named synthetic fixture
    When I accept part-003 then part-001 then the identical part-001 again
    Then accepted IDs are exactly part-001 and part-003 in canonical order
    And arrival order remains part-003 then part-001
    And the duplicate observation does not add bytes or a second accepted ID

  Scenario: Guard invalid identities, conflicting bytes and incomplete completion
    Given part-001 has been accepted
    When an unknown ID or non-fixture bytes or a conflicting duplicate is submitted
    Then the operation fails explicitly without changing accepted IDs or bytes
    When I try to complete with missing accepted parts
    Then completion fails and no final hash or successful receipt is reported

  Scenario: Completion order is explicit and duplicates cannot hide missing parts
    Given all four parts have been accepted in any arrival order
    When completion lists duplicate, unknown, missing or noncanonical part IDs
    Then completion fails without marking the fixture complete
    And only the exact manifest part order may be reassembled

  Scenario: Pause and resume the same retained in-memory fixture
    Given part-002 and part-004 have been accepted
    When I pause then resume this same JavaScript object
    Then the observed accepted and missing IDs and byte count remain exact
    And a second new fixture does not inherit accepted parts
    And reload or reset is not claimed to recover a durable upload

  Scenario: Compute a real final SHA-256 over accepted synthetic bytes
    Given all four actual synthetic parts have been accepted
    When I complete in manifest order with the pinned expected SHA-256
    Then SHA-256 is computed over the actual assembled 256 bytes
    And an independent SHA-256 and exact byte comparison agree
    And the successful receipt names the accepted ordered part IDs and C020 lineage
    But a wrong expected hash or failed digest is an explicit incomplete outcome

  Scenario: Conduct with keyboard, clear errors and honest reset
    Given the local file page is loaded with no successful observation
    When I use Tab and Enter to start, accept, pause, resume and complete
    Then labels, live status, visible focus, accepted IDs and actual hash are inspectable
    And errors clear stale completion output without discarding accepted parts
    And reset while hashing cannot publish a stale completion from the old fixture
    And reset clears receipt, accepted parts and resume observations
    And a restrictive CSP rejects inline execution and outbound connections

  Scenario: Preserve published proof during ordinary verification
    Given browser evidence has been explicitly captured
    When ordinary tests and the isolated browser check run again
    Then committed evidence bytes are unchanged
    And the qualified openIsolatedLesson session is awaited closed in finally
    And refresh requires CAPTURE_BROWSER_EVIDENCE=1
