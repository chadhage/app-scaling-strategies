Feature: S138 pagination cursor reuse across a fictional migration
  A-S138 is one satisfier in SC-S138, with parent D-S138.
  Every dataset, cursor, version, schema, request and response is fixed teaching DATA.
  No database, HTTP endpoint, account, credential or user data is accessed.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And a pinned fictional snapshot of profile-01 through profile-06 in ascending ordinal order
    And profile-v1 labels, an opaque saved teaching cursor, and a maximum page size of four
    And a short nonterminal v1 first page containing profile-01, profile-02 and profile-03

  Scenario: Reuse the exact saved cursor on v2 while preserving its snapshot contract
    When I open the first page, migrate with the preserved contract and reuse the saved cursor
    And I check the complete result
    Then the second receipt shows v2, the same cursor and the original snapshot
    And all six profiles are observed exactly once in the declared order and schema
    And the measured local outcome is positive, not native migration proof

  Scenario Outline: A success-shaped receipt does not override result correctness
    When I migrate with "<condition>" and reuse the saved cursor
    And the fictional receipt says status 200 and cursor accepted
    And I check the result
    Then the measured outcome is interrupted because of "<defect>"
    And the original first page and both request/response receipts remain visible

    Examples:
      | condition         | defect                                 |
      | accepted-missing  | profile-05 is missing at an observed end |
      | accepted-duplicate| profile-03 is returned twice            |
      | accepted-reorder  | profile-05 precedes profile-04           |
      | changed-schema    | v2 names cannot satisfy profile-v1 labels |
      | changed-snapshot  | a live-v2 snapshot is not the pinned snapshot |

  Scenario: Completion remains unknown without a terminal observation
    When v2 accepts the cursor and the final completion observation is unavailable
    And only profile-04 is additionally observed
    Then checking reports unknown completion, not zero missing results or success
    And profile-05 and profile-06 are unobserved, not certified lost
    And there is no fabricated terminal token, retry or recovered result

  Scenario: Rejecting an old token is an interrupted journey, not a successful migration
    When the fictional v2 receipt rejects the saved cursor with status 410
    Then checking reports interruption and unknown completeness
    And the accepted v1 first page is retained

  Scenario: Guard typed inputs, canonical state and action ordering
    Given an unopened lesson
    When a step is attempted out of order, an unknown condition is selected or a token is altered
    Then a specific recoverable error is announced without changing state or history
    And strings, booleans, numbers, accessors and corrupt request/result records are not coerced
    And at most two fixed pages and four history entries exist in one attempt

  Scenario: Browser keyboard, error, reset and confinement
    When I operate the labelled controls using the keyboard
    Then focus, disabled steps, result rows and the live outcome match the state
    And invalid input announces an error while retaining the previous observations
    And Reset all clears the synthetic attempt and history and restores the first control
    And blocking the model script presents a visible unavailable error with reset still usable
    And the active CSP blocks inline scripts and outbound connections without unsafe flags

  Scenario: Normal verification never rewrites historical evidence
    Given preserved red, source and browser observations outside test autodiscovery
    When focused verification runs without the exact environment value CAPTURE_BROWSER_EVIDENCE=1
    Then every historical evidence byte remains unchanged
    And any other capture value is read-only
