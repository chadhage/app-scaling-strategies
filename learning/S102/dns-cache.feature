Feature: Compare fixed fresh and cached DNS observations without assuming convergence
  The lesson is resource-free teaching data, not a DNS query or live Azure result.
  The operator can change only the memory-only fixture and cannot change any endpoint.
  Fresh observations select 192.0.2.20 after the fixed switch at synthetic t=30.
  Cached A expires at t=120; cached B expires at t=180.
  The declared overlap retains 192.0.2.10 through t=180.
  There are three declared sampled journeys, a fixed 10 ms budget, and at most 12 comparisons.

  Scenario: Retain the old destination while immediate sampled answers differ
    Given the fixed old destination is retained for the declared overlap
    When I publish the synthetic switch and compare complete observations at t=30
    Then fresh selects the new destination and both cached samples still select the old destination
    And all three fixed journeys succeed
    And immediate or universal DNS convergence is not established

  Scenario: A first cache expiry is not everybody's cache expiry
    Given the fixed old destination is retained
    When I compare complete observations at t=120
    Then fresh and cached A select the new destination while cached B still selects the old
    And all three fixed journeys succeed without prematurely retiring the old destination

  Scenario: Agreement among the samples is not a universal convergence certificate
    Given the fixed old destination is retained
    When I compare complete observations at t=180
    Then all three observed samples select the new destination
    But the lesson does not certify any unobserved resolver or real DNS convergence

  Scenario: Retiring the old destination breaks cached journeys
    Given the old teaching destination is retired at the synthetic switch
    When I compare complete observations at t=30
    Then one fixed fresh journey succeeds and two cached journeys are interrupted
    And the negative-test verifier may pass without reclassifying interruption as success

  Scenario: Missing cached evidence is unknown rather than success
    Given the old teaching destination is retained
    When I compare at t=30 with cached B's observation missing
    Then two journeys succeed and one remains unknown
    And absent resolver, answer, routing, and latency evidence is not invented

  Scenario: A learner explanation does not overwrite measured outcomes
    Given an interrupted or unknown comparison
    When I correctly predict its outcome and select retention plus limited sample coverage
    Then the interpretation passes while the comparison outcome and denominator stay unchanged
    And immediate or universal convergence claims fail the interpretation

  Scenario: Strict inputs, state, history, reset, and browser boundaries
    Given one completed comparison
    When I reset the rehearsal
    Then defaults and the current trace are restored and every earlier comparison remains in history
    And stale tokens, wrong types, extra fields, corrupted state, invalid phases, and a thirteenth comparison are rejected atomically
    And standard keyboard controls, announced focused errors, reset, and enforced CSP work in the actual isolated browser
    And normal verification does not modify any source or evidence
