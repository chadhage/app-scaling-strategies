Feature: Public success cannot certify a private dependency path
  Training rehearsal - synthetic data - not a live Azure result
  All probes, DNS answers, placement, access and durations are fixed fictional DATA ONLY.
  No network, system, resource, identity or dependency operation is performed.

  Background:
    Given the required application client is "application-private-segment"
    And the required DNS answer is "private-address-label"
    And the required dependency is "orders-private-label"
    And management access must remain unexposed
    And the private journey budget is 150 synthetic milliseconds
    And at most 12 records may be retained in one page session

  Scenario: A public success leaves the actual private path unknown
    Given the private DNS teaching condition would use a public answer
    When the operator records only the successful public probe
    Then public HTTP 200 and 24 synthetic milliseconds are visible
    And the actual private path and its duration remain unknown
    And private eligibility is blocked, not certified by the public success

  Scenario: Internal health is also not evidence of the private dependency
    When the operator records public and internal probes without a private comparison
    Then both measured teaching probes succeed
    But the actual private path remains unknown and ineligible

  Scenario Outline: Compare observations from the required application client
    When the operator compares the "<condition>" private teaching trace
    Then public and internal successes remain separately visible
    And the private result is "<outcome>"
    And the private gate is "<gate>"

    Examples:
      | condition            | outcome | gate        |
      | private-ready        | success | eligible    |
      | dns-public-answer    | failure | not eligible |
      | connection-denied    | failure | not eligible |
      | authorization-denied | failure | not eligible |
      | wrong-dependency     | failure | not eligible |
      | management-exposed   | failure | not eligible |
      | dependency-slow      | failure | not eligible |
      | private-unobserved   | unknown | not eligible |
      | dns-unobserved       | unknown | not eligible |

  Scenario: A successful probe from the wrong client is not an actual-path failure or success
    Given an unrelated external client has a successful teaching trace
    When the operator compares the "wrong-client" condition
    Then probe placement fails the applicability check
    But actual private connectivity, DNS, access and duration remain unknown
    And the unrelated success cannot approve the required private path

  Scenario: Missing access measurements do not conceal an observed connection failure
    When the operator compares the "connection-denied" condition
    Then observed private connectivity fails
    And unobserved authorization and dependency completion stay unknown
    And the private result is failure, not public success or an invented completion

  Scenario: A later success and reset preserve earlier failed and unknown records
    Given failed, unknown and successful private comparisons are recorded
    When the operator resets the current exercise
    Then default selections, empty current output and keyboard focus are restored
    And every earlier record and its original result is retained
    And successes plus failures plus unknowns equal all recorded comparisons
    And reset does not replenish the 12-record allowance

  Scenario: Reject invalid or forged input and state without side effects
    Given inputs and state require exact non-coercing typed schemas
    When an invalid selection, accessor, extra field, sparse array or forged record is supplied
    Then no result or history record is added or changed
    And browser input errors are announced and focused

  Scenario: Actual browser controls and CSP are observed
    When the operator uses Tab, arrow keys and Enter to compare and reset
    Then the same result appears as with mouse controls
    And a bounded-history error is visible and focused
    And permitted local lesson scripts load without external requests
    And a page-owned test script observes blocked inline script and eval execution
    And the published isolated-browser session is closed in an awaited finally block
