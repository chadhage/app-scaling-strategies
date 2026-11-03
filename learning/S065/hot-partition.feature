Feature: S065 hot-partition rebalance rehearsal
  # A-S065 / D-S065 / SC-S065; frozen Kano S, one portable synthetic unit.
  # Source: README.md S065; backlog D-S065; kanban portable A-card contract.
  # No native partition, migration, routing, ownership or Azure proof.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And synthetic partition HOT starts on shard-old with committed effect H0
    And unrelated partition COLD remains on shard-cold
    And three fixed phases each attempt one read and one write on each partition
    And at most six completed attempts are retained in memory

  Scenario: Synchronized exclusive relocation preserves committed effects and routing
    Given coordinated hot routing, exclusive ownership, current target data and complete observations
    When the operator starts and observes before, cutover and after phases
    Then all twelve observed operations succeed
    And hot reads retain H0 and every acknowledged hot write
    And HOT moves from shard-old to shard-new while COLD stays on shard-cold
    And every observed phase has exactly one active hot owner
    And the synthetic verdict is success, not native certification

  Scenario: A transient hot routing gap is not erased by recovery
    Given a hot routing gap at cutover and complete observations
    When the operator completes the rehearsal
    Then the cutover hot read and write fail explicitly with no route
    And the after phase is routed to shard-new
    But the verdict remains failure and the routing gap remains in history

  Scenario: A stale route reaches a fenced former owner
    Given stale hot routing and exclusive ownership
    When HOT is handed to shard-new
    Then hot requests still directed to shard-old fail explicitly
    And COLD operations continue without being mistaken for hot migration proof

  Scenario: Two active owners fail even if routed operations appear successful
    Given coordinated routing, current data and overlapping hot ownership at cutover
    When all observations are present
    Then twelve client operations can succeed
    But the observed two active hot owners make the verdict failure
    And fencing the old owner in the after phase does not erase that failure

  Scenario: A correct route cannot compensate for a missing acknowledged write
    Given coordinated routing and exclusive ownership
    But the target snapshot omits the before-phase acknowledged effect H1
    When the operator completes all phases
    Then hot reads report missing committed effect H1
    And the verdict is failure

  Scenario: Missing observations are unknown, not success
    Given coordinated routing, exclusive ownership and current target data
    When cutover observations or all observations are absent
    Then unobserved operations are counted separately
    And the verdict is unknown
    And a known after-phase failure still dominates missing evidence

  Scenario: Inputs and lifecycle cannot bypass the exercise
    Given exact enumerated inputs with no extra keys or endpoints
    Then invalid input, repeated start, early new attempt and extra phase are rejected without mutation
    And run inputs and returned snapshots cannot alter retained history
    And a seventh completed attempt is refused until explicit reset

  Scenario: The actual browser supports keyboard, error, history and reset
    When the operator uses the keyboard to configure and run the lesson
    Then configuration is locked during the attempt
    And the live summary, trace and retained history show measured synthetic results
    And a rejected input is announced without creating an attempt
    And new attempt retains previous failures
    And reset explicitly clears all attempts and restores keyboard focus
    And no form control shadows the native form reset method

  Scenario: Content security is enforced in the actual browser
    Given local external scripts and styles only
    Then inline script, inline handlers, external connections and framing are disallowed
    And a harmless inline-script probe is blocked with an observed CSP violation
    And the lesson makes no external or management requests
