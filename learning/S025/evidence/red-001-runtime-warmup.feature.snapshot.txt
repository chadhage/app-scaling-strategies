Feature: S025 runtime and cache warm-up
  One A-S025 satisfier in SC-S025; local synthetic observations only.
  Initialization evidence and client latency are different acceptance gates.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And a synthetic cold read costs 1040 ms with a 200 ms client budget
    And JVM/JIT, application beans, connection pool and critical cache start skipped
    And no real traffic, resources, credentials or management calls are involved

  Scenario: Compare a cold request with explicitly primed runtime phases
    When I compare the skipped phases and predict HOLD
    Then initialization fails with 0 of 4 phases primed
    And cold and candidate latency are both 1040 ms
    And permission is HOLD and my learning answer passes
    When I prime all four phases and predict EXPOSE
    Then initialization succeeds with 4 of 4 phases primed
    And candidate latency is 100 ms, saving 940 ms against the cold reference
    And latency succeeds against the 200 ms budget
    And permission is EXPOSE in this model only, with zero traffic moved
    And the earlier failed run and its configuration remain in history

  Scenario: Initialization success is not acceptable client latency
    Given all four phases are primed
    When I choose an 80 ms budget and predict EXPOSE
    Then initialization succeeds but 100 ms client latency fails
    And permission is HOLD and my learning answer fails

  Scenario: A large latency budget cannot hide skipped initialization
    Given all four phases are skipped
    When I choose a 2000 ms budget and predict HOLD
    Then 1040 ms client latency succeeds but initialization fails
    And permission remains HOLD

  Scenario Outline: Incomplete observations do not become positive evidence
    Given all four phases are primed
    When I select <condition>
    Then initialization is <initialization>
    And candidate latency is UNKNOWN rather than zero
    And the outcome is <outcome> and permission is HOLD

    Examples:
      | condition                 | initialization | outcome |
      | failed application beans  | FAILURE        | FAILURE |
      | unmeasured connection pool| UNKNOWN        | UNKNOWN |
      | unmeasured export route   | SUCCESS        | UNKNOWN |
      | unsupported stream route  | SUCCESS        | UNKNOWN |

  Scenario: Invalid controls never leave a stale success on screen
    Given I have a successful comparison in history
    When I change controls or supply an invalid choice or budget
    Then the current result is unchecked UNKNOWN until another valid comparison
    And invalid input focuses a visible alert and adds no run
    And the last valid history remains visible without changing its observations

  Scenario: Bound history, state and reset with keyboard controls
    Given a maximum of 8 retained comparisons and 64 configuration changes
    When I exceed a bound or provide malformed or inconsistent state
    Then the operation is rejected without eviction, coercion or a healthy fallback
    When I activate Reset lesson using the keyboard
    Then history and errors clear, skipped defaults return and JVM/JIT is focused

  Scenario: Local browser security and evidence honesty
    Then keyboard controls, focused errors, live results and a skip link work
    And actual CSP blocks inline code, inline handlers and connections
    And ordinary verification never rewrites historical proof
    And deliberate browser capture requires CAPTURE_BROWSER_EVIDENCE=1
    And the published isolated browser is closed with awaited finally cleanup
    And none of this is native Java, production Node24 or source-parent completion
