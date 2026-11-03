Feature: S049 ambiguous POST completion
  Training rehearsal - synthetic data - not a live Azure result
  Source: README.md S049; parent D-S049; card A-S049; packet SC-S049.
  One fixed synthetic order is worth 10 units. Its first POST commits once,
  then loses its response. A lost response does not roll back that business effect.
  The shared atomic-key ledger is a deterministic teaching assumption, not a
  real transaction, HTTP request, distributed protocol, or Azure guarantee.

  Scenario: Retry the same operation with the same key
    Given the synthetic atomic key-and-payload ledger is selected
    And the original deadline is 100 synthetic milliseconds
    When the operator commits the POST and loses its response
    Then one effect exists and the client is explicitly unresolved
    When the operator retries the same payload and synth-key-A at 30 milliseconds
    And receives the remembered result for synth-effect-1
    Then the effect count remains one
    And the client receives the original 10-unit result
    And the outcome is success within the original deadline

  Scenario Outline: A retry is not automatically safe
    Given a committed POST with its response lost
    When the operator retries using <condition>
    Then the observable result is <result>
    And a prediction never changes that user-impact result

    Examples:
      | condition                              | result                                             |
      | no deduplication and the same key       | failure, two business effects                       |
      | a different key                        | failure, two business effects                       |
      | the same key and a changed payload      | failure, conflict rejection, one effect              |
      | no key with atomic-key enforcement      | failure, missing-key rejection, one effect           |
      | the same key but another lost response  | unknown, one effect and explicit unresolved client   |
      | a retry later than the original budget  | failure even if one effect and a correct reply       |
      | duplicates and another lost response   | failure dominates the unresolved client              |

  Scenario: Equality at the deadline is allowed
    Given a safe same-key retry arrives exactly at the original deadline
    Then the synthetic outcome is success
    And no retry restarts or extends that deadline

  Scenario: Strict inputs and state transitions
    Given only fixed synthetic keys and payloads can be chosen
    Then unknown properties, invalid enums, non-integer or out-of-range numbers fail
    And missing, extra, or malformed command arguments fail
    And retry before commit, repeated commit, repeated retry, premature assessment,
      invalid predictions, and premature new attempts do not change any state
    And snapshots cannot mutate the private ledger or retained history

  Scenario: Retain and bound complete attempts
    Given an operator checks a prediction after observing a retry
    Then the result, configuration, client result, effect ledger and trace are retained
    When a new attempt starts
    Then previous attempts remain unchanged
    And after six complete attempts another attempt is blocked without eviction
    When the operator explicitly resets
    Then exact default configuration, empty history and the starting phase return

  Scenario: Real browser, keyboard, errors and CSP
    Given the standalone HTML is opened through the published isolated file helper
    Then the exact synthetic banner, source, objective and limits are visible
    And keyboard controls can commit, retry, predict, start again and reset
    And disabled controls and invalid numeric input cannot mutate state
    And unsafe retries visibly fail and lost replies visibly remain unknown
    And text-only rendering and CSP block inline script and network connections
    And normal verification never rewrites retained proof
    And browser evidence is written only with CAPTURE_BROWSER_EVIDENCE=1
