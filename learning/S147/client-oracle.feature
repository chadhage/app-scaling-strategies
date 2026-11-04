Feature: S147 client-side correctness is not HTTP health
  All requests, responses, identities, versions, state, effects and measurements
  below are fixed fictional teaching data. No service or business operation runs.

  Background:
    Given the standalone lesson displays "Training rehearsal - synthetic data - not a live Azure result"
    And source A-S147 is the original S satisfier in SC-S147 at P0 with the SOURCE gate
    And the source requires detection of empty success, silent logout, lost state, duplicate effects and broken UI

  Scenario Outline: Observed acceptance failures defeat misleading HTTP 200
    When the operator conducts and inspects the "<fixture>" fixture
    Then all fictional transport observations are HTTP 200 and ready
    But the "<assertion>" client assertion is FAIL
    And the original journey remains interrupted
    When the operator selects CLIENT-SIDE FAILURE and checks
    Then the learner verifier is PASS
    But expected-negative detection is not a successful user journey

    Examples:
      | fixture          | assertion            |
      | empty-success    | nonempty-response    |
      | silent-logout    | authentication       |
      | lost-state       | preserved-state      |
      | duplicate-effect | exactly-one-effect   |
      | broken-ui        | usable-compatible-ui |

  Scenario: Positive control
    When the operator conducts and inspects "positive-control"
    Then its ten assertions pass across two original journeys
    And two of two original journeys are completed
    And CLIENT-SIDE CORRECT is the correct learner selection

  Scenario: Missing observations are unknown, not invented failures or success
    When the operator conducts and inspects "missing-observation"
    Then five of five client assertions are UNKNOWN
    And zero of one original journeys are completed or interrupted
    And one of one original journeys is unknown despite HTTP 200 and readiness
    And UNKNOWN is the correct learner selection

  Scenario: Recovery does not rewrite the original interruption or unknown
    When the operator conducts and inspects "later-recovery"
    Then one of two original journeys remains interrupted
    And one of two original journeys remains unknown
    And two of two journeys have an observed later recovery
    And fourteen PASS, one FAIL and five UNKNOWN assertions use twenty observations
    And CLIENT-SIDE FAILURE remains the correct learner selection

  Scenario: A wrong answer is retained independently of client impact
    Given the operator has inspected "duplicate-effect"
    When the operator checks CLIENT-SIDE CORRECT then CLIENT-SIDE FAILURE
    Then learner FAIL and learner PASS both remain in the run history
    And the interrupted original journey and observed two effects never change

  Scenario: Typed replay guards and bounded history
    Given commands require exact fields, exact types and the current integer revision
    Then stale, repeated, forged, reordered and cross-run commands are rejected
    And missing observations cannot be forged into a canonical report
    And at most eight runs with three checks each are retained without eviction
    And reset starts a new in-memory rehearsal, not a storage or business operation

  Scenario: The actual browser is usable and fails closed
    Given the lesson is opened using the published isolated helper and signed Edge
    When an operator conducts, inspects, selects and checks using only a keyboard
    Then the trace, exact assertion JSON and original-impact JSON are visible
    And wrong selections and invalid controls produce accessible errors without erasing history
    And reset clears only the fictional rehearsal and returns focus to the fixture picker
    And inline scripts and inline styles are blocked by the actual CSP
    And the page uses no network, storage, worker, cloud, credential or business operations
    And the isolated session is awaited closed in finally

  Scenario: Verification does not rewrite evidence
    Given normal unit, syntax, integrity and browser verification is read-only
    Then only the exact CAPTURE_BROWSER_EVIDENCE=1 writes a deliberate unique raw browser capture
    And every behavioral RED and raw failed attempt stays outside test autodiscovery
    And offline Playwright 1.56.1, signed Edge 156 and Node 22 prove only this local lesson
    And native B-S147 and the original source-demo acceptance remain blocked and separate
