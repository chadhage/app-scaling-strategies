@A-S031 @S031 @D-S031 @SC-S031 @synthetic
Feature: Detect session-state loss across versions and instances
  Training rehearsal - synthetic data - not a live Azure result
  Two invented clients have separate declared, nonempty profiles.
  v1/blue-a, v1/blue-b, v2/green-a and v2/green-b understand profile schema 1.
  Local mode seeds each client's origin instance only.
  Shared mode seeds one synthetic map read by all four instances.
  Every stored-profile fixture returns HTTP 200, even when its profile is empty.
  Continuity requires the requested client, version and instance plus every
  declared profile field, including its nonzero revision, to match.

  Scenario: Shared state survives repeated version and instance changes
    Given a new shared rehearsal with client-amber at v1/blue-a
    When client-amber reads at v2/green-a, v1/blue-b and v2/green-b
    And client-cobalt reads at v2/green-b
    Then every reply is HTTP 200 and preserves that client's declared profile
    And each read exposes its requested and observed version and instance
    And the two clients do not exchange profiles

  Scenario: Local state disappears despite HTTP success
    Given a new local rehearsal with client-amber seeded at v1/blue-a
    When client-amber reads its stored profile at v2/green-a
    Then HTTP 200 passes but continuity is interrupted by the empty profile
    And the original declared profile and revision remain the expectation
    When client-amber returns to v1/blue-a
    Then that read preserves the profile
    But the run retains the earlier interruption rather than reporting all reads preserved

  Scenario: Another instance of the same version also loses local state
    Given a new local rehearsal with client-amber seeded at v1/blue-a
    When client-amber reads its stored profile at v1/blue-b
    Then continuity is interrupted even though version v1 and HTTP 200 are unchanged

  Scenario Outline: Success-shaped profiles cannot replace the declared state
    Given a new shared rehearsal
    When client-amber receives HTTP 200 with a <profile> profile
    Then continuity is interrupted
    And the assertions show the expected state beside the observed state
    And verifying this reply does not repair or overwrite the shared store
    Examples:
      | profile          |
      | empty            |
      | reset to default |
      | stale revision   |
      | another client's |
      | changed draft    |
      | missing field    |

  Scenario: Unknown evidence is not continuity
    Given a new shared rehearsal
    When a reply is absent or has unknown identity, status or profile schema
    Then its outcome is unknown or interrupted, never preserved
    And the trace retains the missing or incompatible assertion

  Scenario: Invalid commands do not destroy a previous result
    Given a rehearsal with a recorded read and trace
    When the mode, client, target or fixture is unrecognized
    Or supplied reply text is malformed JSON or exceeds the local size limit
    Then the action is explicitly rejected without an uncaught error
    And the prior clients, stores, assertions, counters and trace are unchanged

  Scenario: Switching storage modes starts a separate comparison
    Given a local rehearsal with an interrupted read
    When I switch to shared mode
    Then a new rehearsal has the same declared profiles and no attempted reads
    And a shared stored-profile read at another instance preserves state
    But the switch is not claimed to migrate, repair or prove durability of prior state

  Scenario: Keyboard interaction and Reset keep the lesson honest
    Given the standalone file lesson is open with the training banner and network-denying CSP
    When I operate the mode and request controls with the keyboard
    Then the actual browser announces the resulting continuity assertions
    When I Reset the exercise after failed and unknown replies
    Then local mode, both seed profiles, initial trace and zero attempted reads are restored
    And the result says not tested, not success
    And focus returns to Session storage mode
    And native form reset and submit methods remain callable

  Scenario: Evidence and approval boundaries remain explicit
    Given the lesson has local Node and browser evidence
    Then Node results are not described as browser or live Azure proof
    And IaC is N/A because no cloud generation, management call, deployment or spend is approved
    And no credentials, package installation or production stack decision is required
    And this portable A-S031 result does not accept B-S031 or the whole D-S031
