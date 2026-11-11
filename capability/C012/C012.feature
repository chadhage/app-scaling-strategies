Feature: Explain the pre-run distinction without acquiring run authority
  Original C012, frozen S, kanoUnit C012, packet H003
  Acceptance: Explain reserved versus estimated capacity/cost; verify assumptions
  and remaining allowance are visible before running.

  Scenario: Non-vacuous producer-backed local comparison
    Given the accepted C003 matrix, C004 resource-free plan and C011 synthetic books
    And conductor-a holds 3 standard units costing 12 fictional spend units
    When I review an estimate of 2 standard units costing 8 fictional spend units
    Then reserved and estimated capacity and cost have different labelled rows
    And the actual remaining own allowance is 5 units and 36 spend units
    And assumptions, source, price version and synthetic observation time are visible
    And the local explanation can be marked reviewed
    But no browser review authorizes execution, reservation, Azure or expenditure

  Scenario Outline: Unknown or inconsistent facts cannot become approval or free
    Given <fault>
    When I review the exact supplied inputs
    Then the explanation is blocked and prior review is cleared
    And unavailable capacity and cost stay unknown, never fabricated zero
    Examples:
      | fault |
      | missing or unknown pricing |
      | a native unverified estimate |
      | missing allowance or reservation |
      | a released or expired reservation |
      | stale observation time |
      | mismatched owner or reservation |
      | changed price, capacity or source bytes |
      | a real producer over-admission refusal |

  Scenario: Finite operations preserve the rendered invariant
    Given the actual shared model and actual client source
    When I load, review, acknowledge, edit, reset, retry or discard a stale completion
    Then every action has unique rendered identifiers and reconciled labelled facts
    And only one polite status region exists
    And editing or resetting immediately clears the previous explanation
    And keyboard focus is visible

  Scenario: The exact theme exception is narrow
    Given the exact required Clawpilot theme prelude is first
    Then its exact bytes are bound by a CSP hash
    And business logic is external and self-only
    And all component colors use Clawpilot variables
    And light and dark real Edge observations preserve the authority boundary

  Scenario: Fresh source representations do not rewrite sealed policy data
    Given the accepted browser qualification policy has LF-only canonical JSONL
    When all executable source is copied to LF or CRLF physical verification trees
    Then the sealed policy data retains its exact original bytes
    And the actual unchanged readQualified function still admits the same majors
    But this pure policy observation is not a native browser campaign

  Scenario: The complete AST domain survives its actual JSON transport
    Given independently enumerated statements and initializer metadata
    When the complete domain is serialized and read back
    Then every declared metadata field retains its explicit JSON value
    And an assignment initializer has null rather than an omitted undefined kind
