Feature: Move new sessions while admitted blue journeys finish
  This is a local training rehearsal using synthetic fixtures, not Azure proof.
  New admission, observed requests, old work drain, and rollback retention are
  separate facts. Nominal traffic weights do not establish client continuity.

  Background:
    Given the "old-journey" session is admitted to blue with a valid cart
    And the idle "old-pinned" client still depends on blue
    And "old-work" has one pending blue effect
    And green has not yet passed its compatible-state readiness check
    And the synthetic rollback retention period is ten clock minutes

  Scenario: Only a ready green may receive new sessions
    When I try to switch new-session admission before green is ready
    Then admission remains blue and the switch is rejected
    When green passes the compatible-state readiness check
    And I set the nominal green weight to 100 percent
    And I admit "before-boundary" before switching admission
    Then its observed start request still reaches blue
    When I switch new-session admission to green
    And I admit "after-boundary"
    Then its observed start request reaches green with valid state
    And the admitted blue journey has not been moved or restarted

  Scenario: Old journeys and pinned clients use their observed bindings
    Given green is ready and new-session admission targets green
    When I admit "new-green-001"
    And I read through the old pinned client
    And I finish the admitted blue journey
    Then the new-session request reaches green
    And the pinned read and admitted completion requests reach blue
    And the old cart and subject remain valid with exactly one receipt
    And the request counters are derived from those observations
    And the unresolved pinned client still prevents blue retirement

  Scenario: Drain completion does not end rollback retention
    Given green is ready and new-session admission targets green
    When I finish the admitted blue journey
    And I reconnect the pinned client at a new green session boundary
    And I finish the pending blue work exactly once
    Then the blue drain is complete
    But rollback retention is still open
    When I request guarded retirement
    Then blue stays available and retirement is rejected for retention
    When ten synthetic clock minutes elapse
    And I request guarded retirement
    Then blue retires with no observed interrupted sessions or lost work
    And new green sessions can still make valid requests

  Scenario: Elapsed retention cannot hide unresolved clients or work
    Given green is ready and new-session admission targets green
    When ten synthetic clock minutes elapse
    And I request guarded retirement
    Then retirement is rejected for the admitted journey, pinned client, and work
    And elapsed retention is reported separately from the incomplete drain

  Scenario: Rollback changes new admission without killing admitted green work
    Given green is ready and new-session admission targets green
    And "new-green-001" has been admitted to green
    When I roll back during the retention period
    And I admit "after-rollback"
    And I finish "new-green-001"
    Then the new rollback admission reaches blue
    And the already admitted green journey finishes on green with valid state
    And neither service has been retired

  Scenario: Premature retirement is an explicit unsafe counterexample
    Given green is ready and new-session admission targets green
    When I deliberately force blue retirement before drain or retention completes
    And I attempt the old pinned request
    Then old users are explicitly interrupted and pending work is lost
    And the request observation is unavailable with no valid completion evidence
    And the safety verdict is FAIL rather than an uninterrupted migration claim

  Scenario Outline: Invalid input fails closed without fabricated observations
    When I apply <invalid input>
    Then the action is rejected
    And admission, sessions, work effects, and request counters are unchanged

    Examples:
      | invalid input                    |
      | an unknown action                |
      | a non-finite or fractional weight |
      | a duplicate or malformed ID      |
      | negative or non-finite time      |
      | incompatible readiness evidence  |

  Scenario: Keyboard operation and Reset belong to the actual local browser
    Given I opened this lesson from a file URL in my own browser page
    Then the exact synthetic training label is prominent
    And I can select and apply an action using only the keyboard
    And a blocked action is announced without navigating away
    And invalid data does not alter observed requests
    When I activate Reset rehearsal
    Then fixture state, controls, errors, observations, and trace return to baseline
    And the form's native reset and submit methods have not been shadowed
