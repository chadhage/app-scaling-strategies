Feature: A-S097 compares synthetic warm and cold rollback standby
  One frozen S unit belongs to D-S097 and LP-COMPARE, not X002.
  Training rehearsal - synthetic data - not a live Azure result
  A fixed teaching trace covers retention seconds 0 through 300 inclusive.
  A synthetic rollback is requested at second 240; required capacity is 10 units.
  Recovery and standby labels are teaching data, not deployments, elapsed waits or costs.

  Scenario: Cold standby violates the promised recovery budget
    Given warm retained capacity stays ready and compatible throughout retention
    And its synthetic recovery takes 4 seconds
    And a cold destination has a readiness gap and takes 20 seconds to recover
    When the operator declares a 6 second recovery budget and chooses "promise met"
    Then the warm reference has successful promise acceptance
    And the cold reference and selected cold standby have failure acceptance
    And the selected trace exposes 4 seconds reactivation and 12 seconds warm-up
    And the 16 second cold delay is explicit
    And the unsafe answer fails its decision verifier
    And eventual recovery does not erase the failed promise attempt

  Scenario: Correctly identifying failure is not a successful recovery promise
    Given the cold trace exceeds its original 6 second budget
    When the operator chooses "promise violated"
    Then the decision verifier passes
    But recovery promise acceptance remains failure
    And that failure remains in history and the attempted-check denominator

  Scenario: A larger budget cannot repair a cold retention gap
    Given the operator declares a 24 second budget
    When the selected cold trace recovers in 20 seconds
    Then the recovery timing check is success
    But the readiness gap within the promised retention window still fails acceptance
    And the earlier 6 second promise is not rewritten by this separate rehearsal

  Scenario: Ready retained capacity meets the promise
    Given the warm trace has 12 ready compatible units throughout retention
    When the operator declares a 6 second budget and chooses "promise met"
    Then recovery takes 4 seconds and promise acceptance is success
    And the decision verifier passes
    And earlier failures and their original budgets remain counted

  Scenario: A probe cannot stand in for sufficient retained capacity
    Given the capacity-shortfall trace has fresh evidence but only 6 units for 10 required
    When its recovery timing is 4 seconds within the 6 second budget
    Then timing success cannot turn insufficient usable capacity into promise success
    And promise acceptance is failure

  Scenario: Missing evidence is unknown, not a warm success borrowed from the reference
    Given selected readiness coverage, minimum retained capacity and warm-up duration are unobserved
    When the operator chooses "unverified"
    Then selected recovery time and acceptance are unknown
    And the decision verifier passes without certifying recovery
    And the unknown attempt remains in the denominator

  Scenario: Inputs, state and history have strict bounds
    Given only four named fixtures, two budgets and three answers are accepted
    Then extra keys, coercible numbers, altered history and impossible phases are rejected
    And a checked rehearsal cannot be submitted twice
    And at most six independent checks may be retained
    And reset restores current controls without clearing history or renewing the allowance
    And an empty history is no evidence, not a successful promise

  Scenario: Actual browser DOM, keyboard, errors, reset, failure and CSP
    Given the published isolated helper and the approved offline Playwright and signed Edge pair
    When the operator tabs through labelled controls and activates a decision with Enter
    Then the actual browser DOM renders reference comparison, phase trace and separate verdicts
    And injected invalid input or duplicate submission focuses an announced error
    And Space activates reset and focuses the fixture control without shadowing form.reset
    And failed and unknown checks remain visible after successful later checks
    And an injected inline script is refused by the actual browser CSP
    And no HTTP request or unexpected page error occurs
    And openIsolatedLesson is closed in an awaited finally block
    And normal verification is read-only
    And only deliberate CAPTURE_BROWSER_EVIDENCE=1 captures owned browser evidence
