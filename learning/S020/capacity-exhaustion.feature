Feature: A-S020 quota or maximum-capacity exhaustion rehearsal
  # Source README.md S020; D-S020; packet SC-S020; frozen Kano S.
  # This is resource-free synthetic training, never an Azure quota experiment.
  Background:
    Given two protected reserved units serve four existing journeys per probe
    And the declared harness allowance includes both reserved and sandbox units
    And the page says "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: Exhaust the allowance without consuming the reserve
    Given a total allowance of 4 units and an extra request of 1 unit
    When I exhaust the sandbox allowance
    Then total allocated units are 4 and protected reserved units remain 2
    When I request unsafe expansion
    Then the requested total is 5 but allocated units remain 4
    And the rejection is labeled "Harness admission limit"
    And 1 unsupported unit represents 2 unsupported new journeys per window
    And native Azure quota exhaustion remains untested

  Scenario: Reject promotion while reserved service remains usable
    Given the allowance is exhausted and the unsafe request was rejected
    When I request promotion
    Then promotion is blocked and existing journeys remain on reserved-v1
    When I probe reserved service with the healthy fixture
    Then all 4 existing journeys succeed within the declared latency budget
    And the verifier passes the synthetic safety exercise
    But no new-demand success or native Azure result is claimed

  Scenario: A successful HTTP response can still be an interrupted journey
    Given unsafe promotion was blocked
    When I probe with the over-budget fixture
    Then 1 of 4 journeys fails despite HTTP 200
    When I probe with the healthy fixture
    Then the earlier failure remains and the verifier still fails

  Scenario: Missing evidence is unknown, not success
    Given unsafe promotion was blocked
    When I probe with the missing-observations fixture
    Then 2 journeys succeed and 2 outcomes are unknown
    And the verifier is unknown
    When I probe with the healthy fixture
    Then the earlier unknown outcomes remain unknown

  Scenario: Invalid inputs and out-of-order actions cannot change the run
    When I provide fractional, blank, nonfinite, or out-of-range configuration
    Or request promotion before the admission rejection
    Or forge an observation condition or an untrusted run object
    Or exceed the three-probe limit
    Then the action is rejected without changing capacity, routing, or observations

  Scenario: Keyboard reset retains honest bounded history
    Given a failed or unknown run has observations
    When I archive and reset using the keyboard
    Then the old result and trace remain in page-memory history
    And the new run uses defaults and starts unknown with zero observations
    And focus returns to the allowance input
    And at most four archived runs are retained with pruning explicitly counted

  Scenario: The offline lesson cannot silently execute external or inline work
    Given the lesson is opened with the published isolated file helper
    Then its external local script and style load normally
    But inline scripts, eval, connections, embedded frames, and images are blocked by CSP
    And normal verification does not add, remove, or rewrite published evidence
