Feature: S027 false-positive health responses
  A-S027 is one frozen S unit in SC-S027, with parent D-S027 and SOURCE gate.
  Source README S027 requires rejection of errors, redirects and misleading success.
  D-S027 requires strict status AND business assertions, never health-only promotion.
  All observations are deterministic synthetic fixtures, not HTTP requests.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And existing synthetic routing stays v1 100%, v2 0%
    And no real user journey, Azure resource or transition has been measured
    And the business contract is ready=true, candidate=candidate-v2, profileId=training-profile

  Scenario Outline: Reject unsafe original probe responses
    Given the operator selects "<fixture>" and predicts HOLD
    When the operator checks the candidate
    Then original HTTP status is "<status>"
    And the status assertion is "<statusCheck>"
    And the business assertion is "<businessCheck>"
    And readiness is FAILURE and eligibility is HOLD
    And the prediction verifier is PASS, not a successful migration
    And redirects are never followed

    Examples:
      | fixture        | status | statusCheck | businessCheck |
      | error-500      | 500    | FAILURE     | UNKNOWN       |
      | redirect-302   | 302    | FAILURE     | UNKNOWN       |
      | misleading-200 | 200    | SUCCESS     | FAILURE       |

  Scenario: A misleading 200 cannot be promoted by an incorrect answer
    Given misleading-200 has ready=true but the wrong profileId
    And the operator predicts ADMIT
    When the operator checks the candidate
    Then the verifier is FAIL and eligibility remains HOLD
    And successful, failed and unknown assertion counts are 1, 1 and 0

  Scenario: A positive control requires both assertions
    Given the operator selects ready-200 and predicts ADMIT
    When the operator checks the candidate
    Then both assertions are SUCCESS and eligibility is ADMIT
    And ADMIT means synthetic eligibility only, not a performed promotion
    And zero synthetic users move and real journeys remain UNMEASURED

  Scenario: Missing business evidence is not success
    Given the operator selects unobserved-200 and predicts HOLD
    When the operator checks the candidate
    Then assertion counts are success 1, failure 0, unknown 1
    And readiness is UNKNOWN and eligibility remains HOLD

  Scenario: Controls invalidate only the current result
    Given a checked failure is retained
    When the operator changes the fixture or prediction
    Then the current result is invalidated
    And the prior configuration, trace, counts and failed prediction remain in history

  Scenario: Bound and validate the session without silent eviction
    Given exact finite input schemas and validated canonical history
    Then coercions, extra keys, accessors, inherited records and forged results are rejected
    And eight runs fit but a ninth is rejected without eviction
    And 32 changed configurations fit but a 33rd is rejected
    And unchanged settings consume no configuration revision
    And model operations copy state without mutating their inputs

  Scenario: Keyboard, reset and browser safety
    Given labelled native controls, a skip link, live results and focused errors
    When the operator uses Tab, arrow keys and Enter
    Then the same bounded exercise works without a pointer
    And reset clears history and errors, restores defaults and focuses the fixture control
    And reset is not shadowed by a control named reset
    And the browser enforces CSP against inline code, handlers and connections
    And ordinary verification does not write historical proof
