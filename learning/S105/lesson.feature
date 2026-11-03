Feature: A-S105 fictional setting movement and destination-bound access
  # D-S105, SC-S105, frozen Kano S; all values and observations are teaching data.
  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And two fictional destinations with distinct setting, principal and network tokens
    And only DISPLAY_LABEL is movable in the authored fixture
    And DATA_ALIAS, identity and network remain destination-bound in this fixture
    And no configuration, identity, authorization, network or swap operation is performed

  Scenario: Inspect the effective destination rather than trusting movement
    When I predict destination-bound properties and rehearse the matched fixture
    Then DISPLAY_LABEL exchanges between the two fictional destinations
    And both destinations retain their own DATA_ALIAS, identity and network
    And access is unknown until I explicitly inspect the fixed observation
    When I inspect the effective destination
    Then the recorded destination principal and network have positive fictional observations
    And the result is positive with one attempted and one observed rehearsal

  Scenario: A mistaken all-properties-move prediction fails visibly
    When I rehearse the matched fixture predicting that everything follows the sender
    And I inspect the effective destination
    Then the prediction is incorrect and the lesson result is negative
    But the separate fictional access result is positive
    And the destination still has its original principal, network and DATA_ALIAS

  Scenario Outline: Fixed destination access evidence is not inferred from the sender
    When I rehearse "<fixture>" predicting destination-bound properties
    And I inspect the effective destination
    Then permission is "<permission>" and the path is "<network>"
    And the synthetic result is "<result>"
    Examples:
      | fixture         | permission | network   | result   |
      | identity-denied | denied     | reachable | negative |
      | network-denied  | allowed    | blocked   | negative |
      | unobserved      | unknown    | unknown   | unknown  |

  Scenario: Retain every attempted rehearsal, including pending and unknown observations
    Given a completed negative rehearsal
    When I start another unobserved rehearsal
    Then the negative history row remains
    And the attempted count includes both rehearsals
    And no pending or unknown result counts as positive
    And at most six rehearsals and twelve history events are accepted before reset

  Scenario: Typed commands and replayable state reject impossible transitions
    When an invalid fixture, prediction, action, field, type or state is supplied
    Or observation is requested before swap or repeated
    Or a second swap is requested before observation
    Then an explicit coded error is returned without changing retained state

  Scenario: Browser operation includes keyboard, error, reset and restrictive CSP
    When I use only the keyboard to rehearse, inspect and reset
    Then each control is reachable and the result and history update in the actual DOM
    And an invalid selection is announced without losing earlier history
    And reset returns to the initial selection, table and empty history with focus restored
    And inline script, inline handlers and connection attempts are blocked by CSP
    And an unavailable model fails visibly without a success fallback

  Scenario: Qualification limits remain explicit
    Then movement rules, observations and authorization are fixed fictional DATA ONLY
    And no native Azure guarantee or effective live access is inferred
    And IaC is not applicable because this bundle creates no resources
    And B-S105 and its original source parent remain incomplete
    And tests use Node 22 only as tooling and the published isolated browser helper only
