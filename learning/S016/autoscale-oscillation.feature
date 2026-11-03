Feature: S016 autoscale oscillation
  A-S016 / D-S016 / SC-S016 / one frozen S unit / SOURCE
  Training rehearsal - synthetic data - not a live Azure result
  Canonical strategy: Apply suitable stabilization so repeated scale-out/scale-in
  does not repeatedly interrupt users.

  Background:
    Given two identical synthetic lanes initially have two ready instances
    And each instance serves 100 requests/second with one-window scale-out warm-up
    And each of ten demand windows samples four client journeys in each lane
    And the immediate lane has no stabilization or cooldown
    And stabilization and cooldown are teaching controls, not native Azure rules

  Scenario: Suitable stabilization prevents disruptive capacity reversals
    Given demand alternates between 180 and 60 requests/second for ten windows
    And the stabilized lane requires two consecutive low windows and two cooldown windows
    When the operator advances the same trace in both lanes
    Then the immediate lane repeatedly removes capacity with unfinished work
    And its following high windows exceed the 250 millisecond journey budget
    And the stabilized lane keeps two ready instances and all forty journeys succeed
    And requests, effective changes, direction reversals, interruptions and unknowns are measured separately
    And the completed exercise passes only with observed improvement and no stabilized budget breach

  Scenario: Fewer capacity changes do not excuse excessive cooldown
    Given the rebound trace is high, low, high, low, low, low, high, high, high, high
    And stabilization is two windows and cooldown is five windows
    When sustained low demand permits a scale-in followed by a rebound
    Then cooldown can delay replacement capacity while the queue grows
    And observed stabilized journey budget failures make the exercise fail
    And later recovery never erases earlier interruptions

  Scenario: Scale-out is not ready capacity
    Given a high demand of 360 requests/second
    When a scale-out is requested
    Then the additional instances are not ready until the next window
    And failed readiness remains a recorded failed transition
    And a successful rule decision alone does not establish client success

  Scenario: Missing observations cannot pass as zero failures
    When a window has a missing client observation or unknown effective capacity
    Then null outcomes and unknown counts remain in the cumulative trace
    And a later complete observation does not rewrite the unknown window
    And HTTP 200 with incorrect business state is an interruption

  Scenario Outline: Invalid commands and forged state fail closed
    When an input is <invalid>
    Then the command is rejected without changing configuration, capacity or existing observations
    And its bounded rejection is retained
    And a forged state is rejected before any transition
    Examples:
      | invalid                                  |
      | blank, fractional, exponent or extra key |
      | out of bounds or low demand above high  |
      | unsupported pattern or observation      |
      | configuration changed during a trace    |

  Scenario: Keyboard reset retains useful failed evidence
    Given the operator has observed failures or unknown outcomes
    When the operator activates reset with the keyboard
    Then native form reset restores defaults without reset-property shadowing
    And the complete prior run is archived in page memory
    And archive and command bounds reject additional work rather than deleting evidence
    And a caught application error shows ERROR and reset can recover

  Scenario: Portable and isolated browser surface
    Then the exact training banner is prominent
    And labeled controls, visible keyboard focus and a narrow layout are usable
    And a strict local CSP blocks inline execution and external connections
    And there are no management calls, credentials, cloud resources or native-result claims
    And ordinary verification leaves historical evidence byte-identical
    And deliberate evidence capture requires CAPTURE_BROWSER_EVIDENCE=1
