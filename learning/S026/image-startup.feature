Feature: S026 slow image pull and container initialization
  # A-S026 / D-S026 / SC-S026 / frozen Kano S / SOURCE
  # Source README S026: Keep production serving while the candidate downloads
  # its image and initializes. This is a local synthetic rehearsal only.
  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And a fixed synthetic GA image and a fixed immutable candidate image
    And three successful synthetic requests per observation tick
    And no cloud resources, network, credentials, timers or real container
    And image pull and initialization each take one to three synthetic ticks
    And the operator chooses a handoff observation from tick zero through six

  Scenario: Slow pull retains the old serving deployment
    Given pull takes three ticks and initialization takes two ticks
    When the operator checks handoff at tick one and predicts HOLD
    Then both completion checks are unknown and candidate readiness is UNKNOWN
    And all six synthetic requests remain on GA and none reach the candidate
    And the answer verifier is PASS but no migration is claimed

  Scenario: Successful pull does not mean successful initialization
    Given pull takes one tick and initialization takes three ticks
    When handoff is checked at tick three
    Then the pull check succeeds and the initialization check is unknown
    And GA continues serving and permission is HOLD
    When handoff is checked at tick four with prediction ALLOW
    Then candidate readiness is SUCCESS and the answer verifier is PASS
    And only the final tick's three requests move to the initialized candidate
    And earlier trace rows remain on GA

  Scenario Outline: Explicit startup failures never receive user traffic
    Given pull takes two ticks and initialization takes two ticks
    And the fault is <fault>
    When handoff is checked at tick <tick> with prediction HOLD
    Then readiness is FAILURE with <success> successful completion checks
    And there is one failed completion check and <unknown> unknown checks
    And every synthetic request stays on GA
    Examples:
      | fault           | tick | success | unknown |
      | pull-failure    | 2    | 0       | 1       |
      | startup-failure | 4    | 1       | 0       |

  Scenario: Missing evidence and a wrong answer cannot force admission
    Given candidate observations are missing
    When handoff is checked at tick six with prediction ALLOW
    Then readiness is UNKNOWN and both completion checks remain unknown
    And permission is HOLD and the answer verifier is FAIL
    And all twenty-one synthetic requests remain on GA

  Scenario: Retained bounded evidence is not silently rewritten
    Given an earlier failed run and a later successful run
    When controls change
    Then the current display becomes unchecked but both original runs remain
    And each history row retains its own configuration, trace and verifier
    And a ninth checked run is rejected without evicting any of eight runs
    And malformed inputs, forged results and malformed state are rejected

  Scenario: Keyboard, reset and offline safety
    When the operator uses Tab, arrow keys and Enter
    Then labelled native controls conduct the same exercise
    And an invalid value produces a focused alert without adding history
    And Reset lesson clears errors and history and focuses the pull control
    And the reset button does not shadow the native form reset method
    And CSP blocks inline code, inline handlers and external connections
    And actual browser checks use the qualified isolated helper and await cleanup
    And ordinary verification does not write historical proof
