Feature: Honest bounded local result classification
  # One original C035 / D / P0 / H001; parents H001, H007, H012.
  # Training rehearsal - synthetic data - not a live Azure result

  Scenario: Incomplete evidence is not completed work
    Given the original lacks a required context, schema, timing, state, terminal or provenance dimension
    When the learner inspects that original
    Then the missing dimension is explicit UNKNOWN and the decision is HOLD
    And an independently known original budget or state failure remains FAIL

  Scenario: A cancellation request is not a cancellation acknowledgment
    Given C015 only persists prepared, running and completed synthetic records
    And C017 cancellation is not an accepted implementation
    When a MODELED control only requests cancellation
    Then its work result is UNKNOWN and its decision is HOLD
    And no process absence, HTTP 200, retry, cleanup or undo is inferred

  Scenario: A positive cancellation control is explicitly fictional
    Given a closed MODELED fictional terminal acknowledgment matches its original and context
    When the control is inspected
    Then cancelled work is distinguished from no effects and external undo
    And the result is CANCELLED but not completed work or actual C015 cancellation

  Scenario: Original failures cannot be laundered
    Given an accepted C029 original missed its immutable budget
    When a later attempt succeeds or a submitted copy changes its labels or history
    Then the known original remains FAIL in its original denominator
    And rejection is a protective verifier outcome, not user mutation success

  Scenario: Current Node context and historical browser data stay separate
    Given Node rereads the fixed C015 public restore API without writes
    And the browser uses only unchanged bundled historical C015 and C029 evidence
    When evidence is classified
    Then source-local context is not authenticated current cross-tier association
    And C029 historical local segments and mathematical models are not full journeys

  Scenario: Closed typed input and retained history
    Given an explicit closed source identifier
    When JSON is duplicated, malformed, oversized, nonfinite, tampered or claims eligibility
    Then it is visibly rejected without adopting authority or erasing known originals
    And the bounded classification and error history refuses overflow
    And reset changes presentation and focus only

  Scenario: Actual isolated browser observation
    Given the unchanged published isolated helper and signed sandboxed Edge
    When the learner uses inspect, compare and reset with the keyboard
    Then actual DOM evidence records errors, unknowns, unsupported and cancellation scope
    And CSP blocks inline code and network access
    And exact owned browser resources close in finally
