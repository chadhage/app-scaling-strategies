Feature: Failed canary journeys survive successful synthetic rollback
  A-S092 is one frozen S unit in SC-S092, owned by worker-A-S092.
  Source S092 requires stopped exposure, reversed routing and counted interruptions.
  D-S092 keeps failed journeys in the attempted-transition denominator, not the success numerator.
  All actions are teaching-trace data, never deployment or resource operations.

  Background:
    Given eight fixed synthetic clients and a ready retained old destination
    And one measured canary stage of 25 or 50 percent
    And at most six memory-only checked attempts
    And the banner "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: Starting a canary is not evidence of successful journeys
    When the operator starts the measured canary
    Then the two or four selected journeys are attempted and initially unknown
    And clients remaining entirely on old are comparison journeys, not successful transitions

  Scenario: A healthy measured stage can pass without executing another stage
    Given every selected synthetic journey completes correctly within 250 milliseconds
    When the operator observes the canary and reviews expansion
    Then the stage result is SUCCESS and the next-stage gate is eligible
    And no additional exposure or transition journey is executed by this one-stage lesson

  Scenario: Successful rollback cannot repair an interrupted transition
    Given the first selected client has a synthetic HTTP 503 interruption
    When the operator observes the canary and attempts expansion
    Then expansion is rejected and new candidate admission is stopped
    And desired candidate routing is zero while reversal is not yet observed
    When the operator rehearses a confirmed rollback
    Then observed candidate routing becomes zero and old recovery is SUCCESS
    But the original interrupted journey remains in the denominator and interruption count
    And the canary result remains FAILURE, not a successful migration

  Scenario: Missing observations cannot pass the canary
    Given the first selected journey has no outcome observation
    When the operator observes the canary and rehearses rollback
    Then the transition result is UNKNOWN and expansion is rejected
    And the missing journey remains in the attempted denominator

  Scenario: Known failure dominates uncertainty without hiding it
    Given one selected journey fails and another has missing evidence
    When the operator observes the canary and rehearses confirmed rollback
    Then the transition result is FAILURE with one interruption and one unknown
    And both remain counted after old recovery succeeds

  Scenario: A rollback command is not rollback evidence
    Given a failed canary and missing rollback observations
    When the operator rehearses rollback
    Then desired candidate routing is zero but observed routing is UNKNOWN
    And recovery is UNKNOWN while the original canary remains FAILURE

  Scenario: Model guards protect evidence independently of disabled buttons
    When configuration or prediction has wrong types, extra keys, inherited keys or accessors
    Or an action is repeated or out of order
    Then an explicit error is returned without changing any state or evidence

  Scenario: A correct failure prediction is learning success only
    Given one interrupted canary journey and successful old recovery
    When the operator predicts FAILURE and SUCCESS
    Then the learning check passes while user-impact FAILURE remains visible

  Scenario: History retains all failed and unknown attempts
    When the operator completes several attempts and starts a new attempt
    Then checked history and all attempted-transition denominators are retained
    And an active unchecked attempt also contributes to the denominator
    And returned snapshots cannot change retained evidence

  Scenario: History is bounded without silent eviction
    Given six checked attempts
    When the operator attempts a seventh or requests a new attempt
    Then the model rejects it and preserves all six traces

  Scenario: Keyboard, error and reset behavior is usable
    When the operator uses Tab, Enter and Space
    Then labeled controls, visible focus and the skip link operate the lesson
    And invalid input focuses its field and is announced
    And reset clears inputs, predictions, errors, routes, traces, history and counts
    And reset does not shadow native form.reset

  Scenario: Browser safety and evidence are honest
    Then the actual browser enforces restrictive local-only CSP
    And normal verification is read-only
    And only deliberate CAPTURE_BROWSER_EVIDENCE=1 can create browser proof
    And no native Azure, production Node 24, source-parent or user-continuity certification is claimed
