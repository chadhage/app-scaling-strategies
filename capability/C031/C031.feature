Feature: Distinguish an actual version transition from unchanged-version traffic
  Training rehearsal - synthetic data - not a live Azure result
  Original C031 D / packet H006, parents H006 H012
  Independently Done gates C029 and C034; the fictional profile service moves from v1 (1.0.0) to v2 (2.0.0); IaC N/A

  Scenario: Classify every saved client as exactly one of four outcomes
    Given saved per-client traces with stamped versions 1.0.0 and 2.0.0 of the unchanged C020 getProfile contract
    When I evaluate a set of clients
    Then each client is exactly one of ACTUAL_TRANSITION, UNCHANGED, NOT_TRANSITIONED_YET or FAILED_OR_UNKNOWN
    And a failed client and an unknown client both stay visible with their own counts and reason codes
    And the classification is recomputed from the actions, never taken from a claimed verdict

  Scenario: An actual transition needs the acknowledged change in its required order
    Given a client that sent a request at the old version
    When the server acknowledged the new version and a later request or state is at the new version
    Then the client is an ACTUAL_TRANSITION with that evidence order shown
    But an acknowledged new version that is never used afterwards stays NOT_TRANSITIONED_YET

  Scenario: Only eligible clients form the success rate
    Given clients that started on the old version are eligible, including those that never moved
    When I compute the migration success rate
    Then the numerator counts only ACTUAL_TRANSITION clients and the denominator counts only eligible clients
    And clients whose start version cannot be proven are counted as eligible, never excluded
    And the numerator and denominator are spelled out, never a bare percentage and never 100 percent of nothing

  Scenario: A flood of unchanged new-version clients cannot inflate success
    Given a baseline fleet with a known success rate
    When many clients that only ever used the new version are added
    Then they are UNCHANGED, add nothing to the numerator and leave the eligible denominator as it was
    And their count stays visible next to the unchanged success rate

  Scenario: A replayed new-version request without an acknowledged version is not a transition
    Given a client that started on the old version
    When a new-version request or state appears without a server acknowledgment of the new version
    Then the client is FAILED_OR_UNKNOWN with UNACKNOWLEDGED_NEW_VERSION_REQUEST or STATE_BEFORE_ACKNOWLEDGMENT
    And the success rate is not raised

  Scenario: A duplicated trace cannot count twice or launder a failure
    Given an exact second copy of a successful client trace and a conflicting second trace for an unfinished client
    When I evaluate the set
    Then the exact copy is collapsed and shown, and the client is counted once
    And the conflicting copies make that client FAILED_OR_UNKNOWN with CONFLICTING_DUPLICATE_TRACES
    And a duplicated event inside one trace is FAILED_OR_UNKNOWN, not a second success

  Scenario: A stale cached acknowledgment cannot confirm a transition
    Given a new-version acknowledgment issued before the request it claims to answer
    When I evaluate the client
    Then the acknowledgment is rejected as STALE_ACKNOWLEDGMENT and the client is not a transition

  Scenario: Out-of-order traces are rejected with their reason code
    Given a trace with an acknowledgment before its request, a non-monotonic time or a reordered sequence
    When I evaluate the client
    Then the client is FAILED_OR_UNKNOWN with the first violated ordering code and its position
    And the success rate is not raised

  Scenario: Inspect the exact saved C034 traces read-only
    Given the unchanged C034 saved bundle pinned by raw bytes, LF bytes and accepted Git blob
    When I adapt its two saved traces
    Then the closed history is 3 of 7 with failed, interrupted and summary-only originals kept visible
    And the held snapshot is 1 of 2 with the held original NOT_TRANSITIONED_YET
    And no request token, header, issue time or live correlation is invented

  Scenario: Inspection input cannot supply authority
    Given a client claiming a verdict, an unknown field, an unknown version or a mismatched stamp
    When I evaluate it
    Then it is FAILED_OR_UNKNOWN and no claimed verdict, eligibility or success is adopted
    And a malformed set is rejected with a code, no numerator and no percentage

  Scenario: Static keyboard inspection page
    Given a static page with the exact training banner and a strict content security policy
    When I use Tab, Enter and Space to choose a saved set, evaluate, compare and reset
    Then the classification table, the numerator, the denominator and the unchanged, failed and unknown counts are visible
    And reset changes only presentation and returns focus while the operation history is retained
    And CSP blocks inline scripts and connections, and PASS of the page check means UI verification only

  Scenario: Verification is read-only and publication is scoped
    Given unchanged accepted source pins and pure fictional data
    When the focused, coverage and real isolated Edge checks run
    Then no source or saved evidence byte changes, and every production file reaches 85 percent lines, branches and functions
    And production Node 24, Express, Entra and any real service are neither validated nor registered
