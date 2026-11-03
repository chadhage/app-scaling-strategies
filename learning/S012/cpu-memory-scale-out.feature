Feature: S012 CPU/memory-driven scale-out before saturation
  # A-S012 / D-S012 / SC-S012; one frozen S kanoUnit A-S012.
  # README S012: CPU/memory-driven scale-out, not HTTP automatic scaling.
  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And an offline synthetic pool of 2 ready instances, each with 100 resource units and 100 requests/second
    And the fixture rule is CPU >= 70% OR memory >= 75% for 2 consecutive 10-second windows
    And one added instance requires 2 further windows to become ready, with a maximum of 4 instances
    And the synthetic journey budget is 250 milliseconds

  Scenario Outline: Either resource can trigger a real modeled capacity change
    Given aggregate CPU demand <cpu> and memory demand <memory>
    When the operator advances one metric window
    Then one breach is observed but no instance has been requested
    When the operator advances a second metric window
    Then the requested count is 3 and the effective ready count remains 2
    When the operator advances two further windows
    Then the effective ready count is 3
    And the metric percentage decreases because the ready pool increased
    And no user success is inferred from this capacity change
    Examples:
      | cpu | memory |
      | 140 | 100    |
      | 40  | 150    |

  Scenario: Conduct the whole preemptive transition with independent journey observations
    When the operator observes ten baseline journeys
    And advances two windows to request scale-out
    And observes ten journeys during warm-up
    And advances two windows to observe added ready capacity
    And observes ten journeys after scale-out
    Then all 30 synthetic journeys complete correctly within budget
    And the added instance is observed serving some post-scale journeys
    And the exercise verifier passes without claiming a native result or five-nines proof

  Scenario: Delayed scaling cannot erase a measured interruption
    Given CPU demand 260 and offered load 260 requests/second
    When the operator observes journeys before capacity is ready
    Then queuing and over-budget latency are recorded as interrupted journeys
    When healthy demand is restored and scale-out later becomes ready
    Then later successful journeys do not remove the earlier observations or failures

  Scenario: Rule support is not invented
    Given an unsupported HTTP automatic-scaling-with-slot fixture
    When the operator advances a window or observes journeys
    Then the result is UNSUPPORTED and no capacity or successful client samples are fabricated
    Given an unverified native-profile fixture
    Then the result is UNKNOWN, not a supported Azure configuration

  Scenario: Missing observations and failed capacity remain explicit
    Given missing metric observations
    Then the consecutive-breach streak is broken and the rule result is UNKNOWN
    Given missing effective-capacity observations
    Then effective capacity is UNKNOWN and warm-up cannot be declared complete
    Given a provisioning failure during warm-up
    Then the transition fails without increasing ready capacity
    And the failed transition remains in subsequent evidence

  Scenario: HTTP 200 is not a client correctness oracle
    Given the deliberate incorrect-state and duplicate-effect fixture
    When ten journeys are observed
    Then the affected journey is interrupted despite HTTP 200
    Given a missing client observation
    Then the affected journey is UNKNOWN and is not counted as uninterrupted

  Scenario: Bad input, unknown operations, and bounded execution are honest
    Given blank, fractional, out-of-range, non-numeric, or extra-field input
    Then INVALID is visible and no metric window, capacity change, or client sample is produced
    Given an unknown operation
    Then it is rejected instead of falling back to success
    Given 80 recorded commands
    Then another command is blocked without discarding existing observations

  Scenario: Keyboard, reset, retained history, error recovery, and enforced CSP
    When the operator uses Tab, Enter, and Space to conduct the lesson
    Then inputs have labels and focus is visible
    When reset is activated from the keyboard
    Then native form reset remains callable and default inputs and initial capacity return
    And the previous run and any failures are archived visibly for this page session
    Given an unexpected application failure
    Then ERROR replaces any positive conclusion and reset recovers
    And inline script execution and external connections are blocked by CSP
