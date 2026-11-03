Feature: Rehearse a long operation across a deployment transition
  Training rehearsal - synthetic data - not a live Azure result
  A-S042 / D-S042 / SC-S042 / frozen satisfier S

  Background:
    Given one read-only synthetic operation starts at 0 ms
    And its 12 work units require 12000 ms
    And cutover is at 4000 ms
    And all retries retain its original operation ID and absolute user deadline
    And no clock, trace or host envelope is an observation of Azure

  Scenario: Finish an admitted HTTP request within supported drain limits
    Given drain mode, an 8000 ms drain window and a 16000 ms HTTP limit
    And an original user budget of 18000 ms
    When the operator runs the normal rehearsal
    Then the old HTTP request finishes at 12000 ms
    And the synthetic user result is completed
    And equality at the host, drain or original user deadline is allowed

  Scenario: Continue the same operation durably instead of extending HTTP
    Given durable mode and a 10000 ms HTTP limit
    When the operator runs the normal rehearsal
    Then 4 units and the original deadline are durably checkpointed at 4000 ms
    And HTTP acceptance at 4000 ms is not operation completion
    And the old host retires at 5000 ms
    And a successor resumes the remaining 8 units at 6000 ms
    And the same operation completes at 14000 ms within its original budget

  Scenario: A declared HTTP or drain limit cannot be wished away
    Given drain mode with a 10000 ms HTTP limit or a 7999 ms drain window
    When the operator runs the normal rehearsal
    Then the unfinished operation is interrupted
    And retaining old capacity does not extend the declared limit

  Scenario Outline: Forced termination is not a successful migration
    Given <mode> mode with supported limits
    When the operator forces the active request or successor worker to stop
    Then the synthetic user result is interrupted
    And retained checkpoint state alone is not a completed user operation
    Examples:
      | mode    |
      | drain   |
      | durable |

  Scenario: A retry cannot reset the original user clock
    Given durable mode and the original 18000 ms user budget
    When a delayed retry resumes at 14000 ms and finishes at 22000 ms
    Then the displayed retry duration is 8000 ms
    But the displayed original elapsed time is 22000 ms
    And the original deadline is still 18000 ms
    And the synthetic user result is interrupted
    When the same rehearsal uses an original 22000 ms budget
    Then the operation completes at the inclusive original deadline

  Scenario: Missing result proof never borrows a previous success
    Given a normal completion envelope without result identity or work-unit proof
    When the operator runs the rehearsal
    Then completion correctness is unknown
    And a known host, termination or original-budget violation still interrupts
    And the missing check remains explicitly unknown

  Scenario: Guard inputs, state transitions and bounded history
    Given only drain or durable and the four declared conditions are accepted
    And integer budgets are 1 to 60000 ms
    And integer drain windows are 0 to 12000 ms
    And integer HTTP limits are 1 to 30000 ms
    When a value is missing, extra, malformed, coerced or out of bounds
    Then no operation attempt or successful current result is manufactured
    And earlier run records are retained
    And checking before a run or checking twice is rejected
    And changing controls invalidates the current result but preserves history
    And a seventh run is rejected until reset

  Scenario: Verification verdict is separate from user impact
    Given an interrupted run
    When the operator predicts interrupted
    Then prediction verification passes
    But the run remains interrupted in history

  Scenario: Use a keyboard, recover from errors and reset safely
    Given the browser-openable lesson has the exact training banner
    When the operator uses Tab, Enter and the labeled controls
    Then a run, prediction check and reset are keyboard operable
    And reset restores the exact defaults, empty history and focus
    And no control shadows the native form reset method
    And untrusted input is rendered only as text
    And the browser enforces the local-only CSP without unsafe exceptions

  Scenario: Verification does not mutate retained proof
    Given published RED snapshots and browser evidence already exist
    When normal verification runs without CAPTURE_BROWSER_EVIDENCE=1
    Then it does not rewrite, refresh or silently create any proof file
    And browser sessions use the published isolated helper and awaited finally cleanup
