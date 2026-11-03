Feature: Reject an old deployment epoch without changing current service
  A-S082 is one frozen S unit in SC-S082, owned by worker-A-S082.
  README S082: Reject an old deployment epoch attempting to change current routing or readiness.
  D-S082: Stale updates cannot change current routing or readiness; rejected commands are surfaced with evidence.
  This standalone rehearsal is not B-S082, a live controller, or source-parent completion.

  Background:
    Given the visible banner "Training rehearsal - synthetic data - not a live Azure result"
    And an independent synthetic attempt starts at epoch 12, blue 25%, green 75%, and both endpoints ready
    And the pending old command has epoch 11 and requests blue 100%, green 0% and/or green not ready

  Scenario Outline: An enforced epoch guard rejects a stale command
    Given complete before and after observations and the enforced guard
    When the operator delivers the stale command targeting "<field>"
    Then command evidence says "REJECTED" with reason "STALE_EPOCH"
    And epoch, routing and readiness exactly equal the before observation
    And the verifier is PASS with zero changed protected fields
    And rejection is not reported as a successful migration
    Examples:
      | field     |
      | routing   |
      | readiness |
      | both      |

  Scenario: A deliberately bypassed guard exposes the failure rather than hiding it
    Given a complete observation and the deliberately unsafe bypass
    When the stale command targeting both fields is delivered
    Then the trace says "APPLIED" with reason "GUARD_BYPASSED"
    And routing and readiness changes are counted separately
    And the verifier is FAIL even if the learner correctly identifies the failure

  Scenario: Missing after evidence remains unknown
    Given the enforced guard and a missing after observation
    When the stale command is delivered
    Then its rejection is visible but the after service observation is unavailable
    And the verifier is UNKNOWN, not a measured unchanged-state success

  Scenario: Matching and future epochs are comparison controls, not promotion proof
    When a matching epoch 12 command is delivered with the enforced guard
    Then only its selected fields change and command evidence says "MATCHED_EPOCH"
    When an independent future epoch 13 command is delivered with the enforced guard
    Then it is rejected as "FUTURE_EPOCH" without changing current service

  Scenario: Invalid inputs and impossible transitions cannot advance the exercise
    Then unknown enums, additional fields, non-string inputs and forged states are rejected
    And a second delivery before checking the first result is rejected
    And interpreting or advancing without the required prior step is rejected
    And at most six attempts are retained without eviction

  Scenario: Browser operation and evidence are honest
    When the operator uses the actual DOM and keyboard to deliver and interpret attempts
    Then measurements, rejected-command evidence and history reflect the model
    And incorrect interpretation never rewrites the verifier or earlier attempts
    And errors are announced without losing the prior state
    And explicit reset clears memory and history and focuses the first control
    And CSP blocks inline code, evaluation, connections, images, frames and form submission
    And the lesson makes no management calls, external requests or persistent-storage writes
