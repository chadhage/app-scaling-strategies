@A-S041 @D-S041 @SC-S041 @synthetic
Feature: Preserve a short request across a synthetic admission cutover
  An admission switch changes the destination of new requests, not the owner of
  work already admitted. An old completion is neither a failed migration nor
  proof that a user moved. This lesson does not conduct B-S041.

  Background:
    Given the visible label is "Training rehearsal - synthetic data - not a live Azure result"
    And every clock, request, response, state value, journey and user is synthetic
    And journey "journey-1" starts at 0 ms with its ORIGINAL 180 ms budget
    And its expected cart state is revision 7 and total 4200 cents
    And request "r-before" is admitted at 10 ms with its ORIGINAL 120 ms request budget
    And its work takes 90 ms and its correct response is due at 100 ms
    And new request "r-after" is admitted at 60 ms and completes at 140 ms
    And its ORIGINAL request budget is also 120 ms
    And new admissions switch from v1 to v2 at 40 ms
    And no HTTP traffic, credentials, Azure resources or management calls are involved

  Scenario: Safe cutover lets the old request complete on its original owner
    Given v1 retires at 110 ms
    And both identity-bound completion records have correct responses and cart state
    When I evaluate "Safe cutover"
    Then r-before completes on v1 at 100 ms after the admission cutover
    And r-after is a distinct new admission to v2 at 60 ms
    And neither original admission timestamp nor original budget is rewritten
    And both requests complete within the original request and journey deadlines
    And the synthetic continuity result is "CONTINUITY"
    And the retirement gate is "ALLOW"
    And the counts are 2 attempted requests, 2 completed, 0 interrupted and 0 unknown
    And the trace distinguishes "admission", "cutover", "completion" and "retirement"
    But proven moved users is 0 and actual user migration remains "unknown"

  Scenario: An old completion alone does not demonstrate candidate exposure
    Given only r-before was attempted
    When r-before completes correctly on v1 after cutover
    Then the old completion is legitimate and not a migration failure
    And candidate admissions is 0
    And no moved-user claim or migration success percentage is produced

  Scenario: Premature retirement interrupts work even if a fixture claims success
    Given v1 retires at 70 ms while r-before is still active
    And a contradictory response record claims r-before completed at 100 ms
    When I evaluate "Premature retirement"
    Then r-before is "interrupted" at 70 ms
    And its claimed later response is not counted as a completion
    And r-after can still complete on v2
    And the continuity result is "INTERRUPTED"
    And the retirement gate is "BLOCK"
    And a prediction of INTERRUPTED passes the exercise check
    But that passing prediction does not change the interrupted user-impact result

  Scenario: A retry clock does not replace the original request budget
    Given r-before takes 155 ms and returns at 165 ms
    And v1 retires at 180 ms
    And its response reports a fresh retry latency of 25 ms
    When I evaluate "Retry clock reset"
    Then its elapsed time is 155 ms from the ORIGINAL admission at 10 ms
    And its ORIGINAL request deadline remains 130 ms
    And r-before is "interrupted" because 155 ms exceeds 120 ms
    And the claimed retry latency is visibly ignored

  Scenario: The original journey budget is separate from each request budget
    Given the ORIGINAL journey budget is 100 ms
    And both requests individually meet their original request budgets
    When r-after completes at 140 ms
    Then r-after is "interrupted" because the ORIGINAL journey deadline is 100 ms
    And no new admission or retry resets that deadline

  Scenario Outline: A response must preserve both correctness and state
    Given completion timing and identity are otherwise valid
    When r-before has <condition>
    Then its outcome is <outcome>
    And the continuity result is <result>
    And the original input is not mutated

    Examples:
      | condition                         | outcome       | result        |
      | the wrong response body           | interrupted   | INTERRUPTED   |
      | the wrong status                  | interrupted   | INTERRUPTED   |
      | cart revision 6 instead of 7      | interrupted   | INTERRUPTED   |
      | a missing response                | unknown       | UNKNOWN       |
      | missing state evidence            | unknown       | UNKNOWN       |
      | no completion record              | unknown       | UNKNOWN       |
      | an explicit interrupted record    | interrupted   | INTERRUPTED   |

  Scenario Outline: Partial uncertainty cannot erase a known interruption
    Given the completion identity and timestamp are valid
    When the completion has <known-failure> and <missing-proof>
    Then its outcome is "interrupted"
    And the missing check remains explicitly "unknown"
    And the known violation is not hidden by that uncertainty

    Examples:
      | known-failure                     | missing-proof    |
      | an original request budget breach | no state record  |
      | an incorrect response             | no state record  |
      | changed cart state                | no response body |

  Scenario Outline: Invalid evidence cannot manufacture continuity
    Given the safe fixture is selected
    When r-before's record has <condition>
    Then its outcome is "unknown"
    And its evidence is marked invalid
    And retirement is not allowed on that record
    And the trace explains the rejected evidence

    Examples:
      | condition                                  |
      | deployment v2 despite its pre-cutover admit |
      | another request or journey identity         |
      | a reset admission timestamp of 40 ms        |
      | a completion timestamp before admission     |
      | a completion timestamp after observation    |
      | a timestamp different from scheduled work   |

  Scenario Outline: Malformed input fails closed without stale success
    When edited JSON contains <condition>
    Then the visible result is UNKNOWN with an input explanation
    And no successful completion or moved-user claim is invented

    Examples:
      | condition                                     |
      | invalid JSON syntax                           |
      | a string, null or boolean clock               |
      | non-finite, negative or fractional timing      |
      | duplicate request identities                  |
      | a missing, empty, sparse or oversized request array |
      | a non-synthetic execution mode                |

  Scenario: Exact boundaries have declared deterministic ordering
    Given a new request is admitted at exactly the cutover timestamp
    Then it is admitted to v2
    Given an old completion is at exactly its original request or journey deadline
    Then that budget is met
    Given an old completion is at exactly the v1 retirement timestamp
    Then completion is processed before retirement and does not interrupt the request

  Scenario: Keyboard operation, unsafe cases and Reset work in a real browser
    When I operate the labeled preset, numeric, prediction and JSON controls by keyboard
    Then I can inspect the safe result, original deadlines and synthetic trace
    When I select premature retirement
    Then the live impact remains INTERRUPTED even if my prediction passes
    When I apply malformed or identity-forged JSON
    Then the result is UNKNOWN rather than the previous successful result
    When I activate "Reset rehearsal" by keyboard
    Then the exact safe fixture, controls, prediction and trace are restored
    And Reset uses a type-button handler, not a native form reset or shadowed form method

  Scenario: Evidence and limits stay honest
    Then every copied trace event carries executionMode "synthetic"
    And the visible verifier checks only the learner's predicted synthetic outcome
    And actual HTTP correctness, latency, state, routing and user migration are "unknown"
    And cleanup reports only in-memory state and no created resources
    And the page uses local scripts, a restrictive CSP and no network APIs
    And IaC is N/A for this resource-free portable lesson
    And Node 22 is test tooling only, not production runtime approval
