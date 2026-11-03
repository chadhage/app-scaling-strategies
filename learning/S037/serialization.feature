Feature: S037 session serialization change
  A-S037 / D-S037 / SC-S037 / frozen Kano S
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given one declared synthetic cart and checkout step encoded as schema 1
    And v1 reads only schema 1 while the candidate v2 reader is selectable
    And a shared in-memory fixture, not a real session store or authentication service
    And at most 12 recorded actions and 12 rehearsal runs per page lifetime

  Scenario: Mixed-version readers preserve existing sessions and rollback
    Given the candidate reads both schemas and keeps writing schema 1
    When I check and attempt transition
    Then v2 reads the existing payload and its own output without changing any field
    And v1 reads the candidate output during coexistence
    And all 3 read probes succeed before the simulated active version becomes v2
    When I roll back
    Then v1 reads the retained candidate output and the simulated active version becomes v1
    And both results remain in history

  Scenario: Incompatible candidate reader blocks exposure
    Given the candidate reads schema 2 only
    When I check and attempt transition with an existing schema 1 payload
    Then a failed read blocks transition and the payload bytes remain unchanged
    And a successful other read cannot erase the failure

  Scenario: Candidate writes can strand old code
    Given the candidate reads both schemas but writes schema 2
    When I check and attempt transition
    Then the v1 coexistence and rollback probe rejects that output
    And transition is blocked before exposure despite 2 successful candidate reads

  Scenario: Silent reset is not serialization compatibility
    Given the candidate substitutes an empty cart and checkout step 0 on an unsupported schema
    When I check and attempt transition with schema 1 writes
    Then both candidate reads report lost state rather than success
    And the silent-reset count is 2 and transition is blocked
    And the original cart and step remain in the fixture and history

  Scenario: Missing evidence and malformed payloads stay distinct
    When I select an unavailable existing payload
    Then 1 unknown read blocks transition without claiming data preservation
    When I select a malformed existing payload
    Then a known parse failure blocks transition without silently substituting an empty session

  Scenario: Invalid input and invalid lifecycle commands are non-destructive
    When a selection is outside the declared values or contains extra keys
    Or rollback is attempted before transition or transition is repeated while v2 is active
    Then a visible error describes the invalid command
    And no active version, retained bytes, result, run number or history entry changes

  Scenario: Reset and keyboard operation retain previous outcomes
    Given I have recorded a failure followed by a successful transition
    When I use Tab, arrow keys and Enter to operate the controls and reset
    Then the controls return to the compatible defaults and focus returns to the reader
    And the new run is unknown with no current evidence and active version v1
    And the earlier failure and success remain visible and are not rewritten
    And the native form reset method is not shadowed

  Scenario: Bounded history and strict browser policy
    Given 12 actions have already been recorded
    When I attempt another action
    Then it is rejected without evicting or modifying history
    And the lesson has no network, storage, management calls or inline executable code
    And the actual browser blocks inline scripts and connections under the declared CSP

  Scenario: Verification preserves published proof by default
    When ordinary focused tests or the browser protocol run
    Then they do not overwrite evidence
    And browser proof is written only with CAPTURE_BROWSER_EVIDENCE=1
    And browser cleanup is awaited in finally using the published isolated helper
