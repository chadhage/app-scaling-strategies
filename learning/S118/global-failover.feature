Feature: S118 global routing failover as fictional teaching data
  The exact banner is "Training rehearsal - synthetic data - not a live Azure result".
  All origins, routes, identities, sessions, state, writes, effects, acknowledgements,
  failures and recovery timings are fixed fictional DATA, never real operations.
  Source README S118 requires another origin without duplicate mutations or lost
  session state. D-S118 additionally requires identity/state and recovery budgets.
  A-S118 is one portable S unit in SC-S118, not native B-S118 or parent acceptance.

  Scenario: A lost acknowledgement does not authorize a second effect
    Given the preserved fixture and a five-second fictional recovery budget
    When the operator records the original mutation with its lost acknowledgement
    And fails over using the fixed alternate-origin observation
    And retries the same fictional operation
    And measures the recorded journey
    Then the outcome is positive with one effect and matching identity/session/state
    And observed origin-B, not desired routing alone, supports that teaching result
    And the fictional recovery is 3000 ms within the 5000 ms budget

  Scenario Outline: Known breaches cannot be relabeled successful failover
    Given the <fixture> fixture and a five-second fictional recovery budget
    When the operator records, fails over, retries and measures the journey
    Then the outcome is negative because <breach>
    And each route/identity/session/state/effect/ack/failure observation stays visible
    Examples:
      | fixture       | breach                                      |
      | duplicate     | two committed effects are recorded          |
      | identity-lost | the fictional identity changes              |
      | session-lost  | session and required state are lost          |
      | route-pending | desired origin-B is not observed origin-B    |
      | late          | 8000 ms exceeds the 5000 ms budget           |
      | unavailable   | the alternate-origin observation has failed |

  Scenario: Missing evidence remains unknown rather than success or assumed loss
    Given the unconfirmed fixture
    When the operator records, fails over, retries and measures the journey
    Then the outcome is unknown
    And unknown effect count, acknowledgement and recovery remain explicit

  Scenario: Inputs and phase transitions are guarded atomically
    Given an idle rehearsal with no recorded history
    When the operator supplies a noncanonical budget or an unknown fixture
    Or requests retry, measurement or failover out of order
    Then an actionable error is shown and no fictional observation is changed
    And budgets are typed integers from one through ten seconds only

  Scenario: Reset retains bounded page-lifetime history
    Given a measured journey and its immutable observation history
    When the operator resets and records another journey
    Then the earlier measurements and reset remain in history
    And four journeys is the explicit maximum without silent eviction
    And reloading starts a new rehearsal rather than claiming durable session storage

  Scenario: Keyboard, failure and CSP behavior are actually observed in Edge
    Given the local page opened with the published isolated browser helper
    When the operator uses Tab, Enter and Space to complete and reset a journey
    Then focus, disabled phase guards and the live outcome are usable
    When an invalid budget or unavailable lesson engine is injected
    Then visible accessible errors prevent an unmeasured success
    And unauthorized inline script, evaluation and connection attempts are denied by CSP
    And normal verification writes no lesson evidence
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures new evidence
