Feature: A-S070 restored-capacity promotion (SC-S070, frozen S)
  Source: README S070 and backlog D-S070
  Promotion requires the declared committed-data boundary and valid ownership;
  incomplete restoration cannot appear successful.
  Every result is synthetic, not a database or native Azure certification.

  Background:
    Given six fixed committed effects at authoritative synthetic boundary 6
    And the restored candidate is "restored-s070" at writer epoch 8
    And the previous writer has epoch 7 and must be fenced
    And the exact visible banner is "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: Promote only verified complete restored capacity with exclusive ownership
    Given boundary 6 is declared and receipts 1 through 6 are restored
    And an epoch-8 grant names the candidate and the previous writer is fenced
    When I stage, verify and request promotion in order
    Then promotion is PASS with one synthetic writer and six preserved effects
    And no management, restore, replication or promotion call is made

  Scenario Outline: Reject incomplete restoration or invalid ownership
    Given <condition>
    When I stage, verify and request promotion
    Then the promotion outcome is FAIL and the candidate is not activated
    And missing committed effects or invalid ownership remain visible
    Examples:
      | condition                                      |
      | only receipts 1 through 4 were restored         |
      | receipt 4 is absent although maximum receipt is 6 |
      | the committed boundary is undeclared            |
      | stale boundary 4 is declared instead of 6       |
      | the previous writer remains active             |
      | the grant has stale epoch 7                     |
      | the grant names another candidate               |

  Scenario: Missing evidence is not success
    Given restoration or ownership evidence is unavailable
    And no known failing check overrides it
    When I request promotion after verification
    Then the outcome is UNKNOWN and zero promotions succeed
    And a known failure alongside unavailable evidence remains FAIL

  Scenario: Rejection is not a successful migration
    Given the candidate is blocked or held
    When my prediction correctly expects FAIL or UNKNOWN
    Then the learning check can pass without changing the promotion outcome
    And synthetic success, failure and unknown attempt counts remain separate
    And the original writer retaining data is not reported as completed promotion

  Scenario: Guard inputs, lifecycle, history and reset
    Given only the fixed boundary, restoration and ownership choices are supported
    Then malformed inputs, unknown fields and out-of-order actions cannot mutate state
    And snapshots are detached and immutable
    And six completed attempts are retained until an explicit reset or reload
    And a seventh attempt is rejected without deleting earlier evidence
    And keyboard activation, visible focus, errors and reset work in the actual DOM
    And reset clears controls, results, errors and history without shadowing form.reset
    And CSP blocks inline code and connection probes
