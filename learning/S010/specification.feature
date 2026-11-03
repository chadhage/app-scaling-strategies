Feature: S010 portable cohort feature-flag rehearsal
  Training rehearsal - synthetic data - not a live Azure result
  Source: README.md S010; backlog.md D-S010; kanban.md A-S010 (SOURCE)
  Kano unit: A-S010, frozen S; owner: worker-A-S010
  Compatible code is already present in one synthetic deployment.
  Flag changes are behavior changes, not deployment migration or authorization.

  Scenario: Observe baseline, cohort activation, and reversal
    Given two pilot and two control synthetic sessions use config v1 and state v1
    When I observe their baseline journeys
    And enable the feature for the pilot cohort using config v1
    And observe the same four journeys
    Then only the pilot sessions use enhanced behavior
    And all session tokens, cart identifiers, and prior data remain intact
    When I revert the flag to off and observe again
    Then all four sessions return to standard behavior on the same deployment
    And each successful journey has exactly one synthetic cart effect
    And the readable verdict passes only this synthetic flag-continuity exercise

  Scenario Outline: Reject incompatible assumptions before flag publication
    Given the declared already-deployed code supports config v1 and state v1 only
    And <condition>
    When I attempt to enable the cohort flag
    Then the compatibility guard rejects publication without changing the flag
    And the trace identifies <reason>
    And the verdict says guarded, not successful migration
    Examples:
      | condition                         | reason                     |
      | proposed configuration is v2       | CONFIG_VERSION_UNSUPPORTED |
      | a synthetic session has state v2   | STATE_VERSION_UNSUPPORTED  |

  Scenario: Reversal cannot conceal an earlier interruption
    Given the pilot flag has been enabled with compatible configuration
    When I deliberately inject state v2 for pilot-1 and observe journeys
    Then pilot-1 is interrupted without a synthetic write
    And other compatible sessions continue
    When I revert the flag and observe again
    Then the incompatible state remains incompatible
    When I restore the compatible state fixture and observe again
    Then later journeys can continue with preserved session and cart data
    But earlier interrupted attempts remain in the denominator and failing verdict

  Scenario: Strict inputs and unsupported operations fail explicitly
    When an event is malformed JSON or has wrong primitive types or extra fields
    Or it names an unknown cohort, client, fixture version, operation, or run version
    Then an explicit coded input error is returned without changing the run
    And strings are never coerced into booleans or version numbers
    And no management, network, identity, native, or deployment action is available

  Scenario: Determinism and observation requirements
    Given the same explicit bounded synthetic event sequence
    Then replay produces identical trace, sessions, counts, and verdict
    And merely changing the desired flag without observations cannot pass
    And neither a missing baseline nor a missing post-reversal observation can pass

  Scenario: Keyboard operation, safe rendering, CSP, and reset
    Given I open index.html directly in a real isolated browser
    Then the exact training banner and native-proof limits are prominent
    And every input has a label and every action is keyboard operable
    And no control named or identified as reset shadows form.reset
    When I submit a valid explicit synthetic event using the keyboard
    Then the actual DOM shows the resulting trace and readable verdict
    When I submit malformed input or hostile markup
    Then an accessible error is shown as text without executing markup
    When I reset the rehearsal
    Then a fresh baseline run starts and prior results are visibly archived in memory
    And the native form reset method still works
    And CSP blocks inline code and outbound connections
