Feature: Active-active serving is not evidence of multi-writer support
  All regions, writers, replication, epochs, state, routing and journeys below
  are fixed fictional teaching DATA ONLY. Nothing contacts or changes a service.
  The declared model has one writer, epoch fencing, optimistic revision checks,
  asynchronous reader replication and a read-your-writes minimum revision.

  Background:
    Given the exact banner "Training rehearsal - synthetic data - not a live Azure result"
    And two serving regions "region-one" and "region-two"
    And the only declared writer is "region-one" at epoch 7
    And the declared current revision is 10 and a committed mutation yields revision 11
    And at most 12 observations can be retained in the in-memory page session

  Scenario: Both serving regions use the supported single writer
    When I verify the contract with the "supported" teaching trace
    Then both regions serve their fixed user journeys successfully
    And the region-two write route is forwarded to region-one, not a second writer
    And epoch 7 and expected revision 10 allow exactly one synthetic committed effect
    And both readers return revision 11 meeting the client minimum revision 11
    And the overall result is positive for this synthetic contract only

  Scenario: Serving success alone is insufficient data-contract proof
    When I inspect serving only with any teaching trace
    Then both regional serving observations are positive
    But writing, conflict handling and read-your-writes remain unknown
    And no observed writer or successful mutation is invented

  Scenario Outline: Active serving does not hide a failed or missing contract observation
    When I verify the contract with the "<trace>" teaching trace
    Then both regions still serve their fixed users
    And the overall result is "<result>"
    And the measured contract observation is "<observation>"

    Examples:
      | trace             | result   | observation                                      |
      | stale-reader      | negative | region-two revision 10 is below client minimum 11 |
      | writer-unobserved | unknown  | writer, epoch and write duration remain null       |
      | stale-epoch       | negative | epoch 6 is fenced; mutation rejected; zero effects |
      | version-conflict  | negative | expected revision 9 conflicts; no overwrite        |
      | local-writer      | negative | region-two is not a supported direct writer        |

  Scenario: Protective rejection is not successful user mutation
    When a stale epoch or optimistic revision conflict is rejected correctly
    Then the protective verifier check is positive
    But the requested mutation is rejected with zero effects
    And the overall user journey remains negative

  Scenario: Strict inputs and replayed state cannot manufacture success
    When an input has unknown fields, tokens, types, accessors or inherited properties
    Or history has forged results, extra fields, holes or inconsistent sequence IDs
    Then the operation is rejected without modifying the existing history
    And invalid observations consume no allowance

  Scenario: Retained history and bounded reset
    Given recorded negative, unknown and positive observations
    When I reset the current exercise
    Then defaults and current output reset and focus returns to the first control
    But history, measured totals and the 12-observation allowance remain
    And a thirteenth observation is rejected rather than silently dropping history

  Scenario: Real browser accessibility, error handling and CSP
    When I use Tab, arrow keys and Enter on the native controls
    Then I can record and reset without a mouse
    And invalid input focuses the error and does not add a history row
    And the retained negative and unknown observations remain visible after success
    And browser-observed CSP blocks inline code, evaluation and connection attempts
