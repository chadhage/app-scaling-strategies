Feature: S032 synthetic slot-routing cookie transition
  Training rehearsal - synthetic data - not a live Azure result
  A-S032 is one frozen S unit in SC-S032, not native B-S032 evidence.
  The fixture has two blue-pinned clients, one green-pinned client and one
  unpinned client with deterministic bucket 75. Slot pins are not worker affinity.

  Scenario: Nominal 100 percent is not observed migration
    Given nominal green allocation is 100 percent
    When the operator replays the four-client cohort
    Then two requests still reach blue because of their slot pins
    And two requests reach green
    And zero of the two originally blue-pinned clients have migrated
    And blue retirement is blocked without creating a user interruption

  Scenario: Cookie targets take precedence over nominal weights
    Given nominal green allocation is 0 percent
    When the operator replays the cohort
    Then the green-pinned client still reaches green
    And the unpinned client reaches blue

  Scenario: Inspect, reassign and verify before retirement
    Given a complete cohort replay in the current routing epoch
    When each originally blue-pinned client is reassigned to green
    And both reassignment replies complete successfully at green
    And all four clients have fresh completed observations at green
    And nominal green allocation is 100 percent
    Then two of two originally blue-pinned clients are verified migrated
    And guarded blue retirement is allowed
    And no further action except reset is allowed after retirement

  Scenario: An interrupted reassignment remains a failure after recovery
    Given the cohort has been inspected
    When one reassignment returns a synthetic 503 at green
    And a later replay succeeds
    Then the latest destination can become resolved
    But the failed attempt remains in the trace and cumulative impact is failure

  Scenario: A lost reply is unknown, not successful migration
    Given the cohort has been inspected
    When a cookie is reassigned but its reply is missing
    Then its requested target is green and its observed target is unknown
    And retirement is blocked until fresh complete destination evidence exists
    And a later successful reply does not erase the earlier unknown attempt

  Scenario: Routing changes invalidate stale observations
    Given all clients have completed at green
    When nominal allocation is applied again
    Then observations from the earlier routing epoch cannot permit retirement
    And a fresh cohort replay is required

  Scenario: Invalid inputs and impossible state cannot mutate the run
    Given strict exact action and state schemas
    Then malformed percentages, unknown clients, extra fields and forged state are rejected
    And reassignment before current-epoch inspection is rejected
    And at most 24 actions may be recorded per run
    And the current trace is unchanged after rejection

  Scenario: Keyboard reset retains bounded, honest history
    Given a run with a recorded failure or unknown attempt
    When the operator activates archive and reset with the keyboard
    Then form defaults and focus return to nominal green allocation
    And the previous run's complete trace and impact remain inspectable
    And at most three archived runs are retained with an explicit eviction count
    And resetting an empty run is idempotent

  Scenario: The portable browser surface has no execution channels
    Given external local scripts and styles under a restrictive CSP
    Then controls, destination tables, errors and reset work in the actual DOM
    And inline script, inline handlers, network connections and form submission are blocked
    And no credentials, cloud calls, real cookies or persistent browser storage are used
