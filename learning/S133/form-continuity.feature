Feature: One original multi-step form survives a teaching cutover
  A-S133 is one frozen original S unit in packet SC-S133, parent D-S133.
  All answers, identities, sessions, tokens, versions, validation, submissions,
  effects and responses are fixed fictional teaching DATA ONLY.
  No authentication, network, persistence or cloud operation is implemented.

  Background:
    Given the exact S133 requirement "Preserve answers, validation state, and submission across deployments."
    And D-S133 requires "Answers, validation, permissions, and one final submission survive the transition."
    And an original v1 form has two fixed answers and prior validation/token/session DATA
    And the banner is "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: Complete the same old form, then retry the same final submission
    When the operator starts the fixed preserved preset
    And cuts over to teaching-v2 between the old and final steps
    And continues with the fixed final answer
    And submits and retries the same fictional submission key
    And measures the original journey
    Then both original answers and prior validation remain intact
    And the original token, identity, session and permissions remain intact
    And the final step and correct client result are completed
    And two attempts have exactly one intended fictional submission/effect
    And the measured result is preserved, not a native Azure claim

  Scenario Outline: Detect failure rather than laundering a new version or HTTP 200
    When the operator conducts and measures the "<preset>" fixed trace
    Then "<check>" is a measured failure
    And the journey result is interrupted
    And reset followed by a preserved trace keeps the earlier failure in history

    Examples:
      | preset                   | check                      |
      | lost-answers             | original-answers           |
      | invalid-prior-token      | prior-token                |
      | lost-validation          | prior-validation           |
      | permission-denied        | permissions                |
      | changed-identity-session | identity-session           |
      | duplicate-submission     | one-submission-effect      |
      | replacement-http200      | original-journey            |

  Scenario: HTTP 200 with unobserved final receipt and effects is unknown
    When the operator conducts and retries the receipt-unknown preset
    And measures the original journey
    Then the effect count and client result are unknown
    And neither a new version nor HTTP 200 establishes preservation
    And reset retains the unknown result and both attempts

  Scenario: Invalid commands and forged snapshots are safe holds
    When an action has wrong types, extra fields, accessors or an unknown preset
    Or a command is out of order or exceeds the declared finite bounds
    Or a snapshot has altered answers, tokens, permissions, history or effects
    Then a typed error rejects it without changing any prior state or evidence
    And the actual UI reports the error and retains its history

  Scenario: Keyboard reset does not discard observed outcomes
    Given a measured failure or unknown and a control named reset
    When reset is activated with the keyboard
    Then the native form reset is called without property shadowing
    And controls and error UX reset with focus on the preset
    And measured runs, attempt records and rejected-action history remain visible
    And an unfinished run is archived as incomplete, never successful

  Scenario: Standalone browser observation and immutable proof
    Given the published isolated helper has the specified SHA-256
    When the real headless signed Edge runs this file with awaited finally cleanup
    Then DOM, keyboard, error, reset, failure and CSP denials are observed
    And no remote request, management call, real user data or storage operation occurs
    And ordinary verification does not write source or evidence
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately adds unique raw proof
    And RED and stub proof remain outside normal test autodiscovery
    And B-S133, D-S133, Node 24 and native qualification remain incomplete
