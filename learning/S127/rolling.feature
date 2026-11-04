Feature: A-S127 bounded synthetic rolling-step rehearsal
  All pods, nodes, probes, rollout, surge, disruption, grace, drain, requests and
  state are fixed fictional teaching DATA ONLY. No Kubernetes operation occurs.

  Scenario: Observed readiness, headroom and grace preserve one rolling step
    Given three observed-ready old pods and one recorded spare pod slot
    And both candidate probes and compatible business-state traces are recorded
    When the operator chooses maxUnavailable 0, maxSurge 1 and grace 20 seconds
    And observes the data, rehearses one rolling step and drains old work
    Then the minimum observed-ready capacity is 3 and peak pod count is 4
    And PreStop consumes 4 seconds leaving 16 seconds for the 8 and 14 second requests
    And two transitions and two old requests succeed in the synthetic trace
    And no complete Deployment, native readiness or real grace is certified

  Scenario: An availability allowance can interrupt work despite a PDB
    Given the fixed workload needs three ready pods and the PDB minimum is two
    When maxUnavailable is 1 during the rehearsed step
    Then the permitted readiness floor is 2 and one transition is interrupted
    And the PDB is not treated as a rollout availability guard

  Scenario: Short grace includes PreStop rather than starting after it
    When a ready surge-first step uses grace 10 seconds
    Then only 6 seconds remain and both old in-flight requests are interrupted
    And later successful work does not erase those interruptions

  Scenario: Missing or failed gates do not expose a candidate
    When headroom is full or candidate readiness has failed
    Then the step safely aborts before exposure and old-only journeys are not transitions
    When readiness, surge headroom or a desired-only pod observation is missing
    Or only a startup probe is chosen
    Then the result is unverified and desired replicas do not become observed-ready capacity

  Scenario: Probe success does not certify business state
    When ready probes accompany a recorded incompatible-state HTTP 200 trace
    Then both candidate transitions are interrupted
    When candidate business-state trace results are missing
    Then both transitions stay unknown instead of becoming successes

  Scenario: The PDB comparison concerns voluntary Eviction API disruption only
    When one voluntary eviction is compared against the fixed three-ready-pod snapshot
    Then the budget permits eviction but surviving capacity 2 is below workload demand 3
    When two voluntary evictions are compared
    Then the budget blocks eviction without certifying a migration
    When fixed node, zone or region loss records are compared
    Then the PDB does not apply and the measured losses remain visible
    When a failure outside the fixed records is selected
    Then capacity and user results remain unknown

  Scenario: Typed actions, bounded state and retained history
    Then noncanonical numeric text, coercible values, unknown keys and accessors are rejected
    And out-of-order actions and repeated disruption comparisons cannot mutate state
    And at most eight rehearsals and 64 history entries can be retained
    And reset clears current controls and state but preserves earlier failures and unknowns

  Scenario: Actual browser observations
    Then labelled controls work by keyboard
    And input errors focus an alert and permit recovery
    And reset does not shadow the native form reset method
    And actual DOM results, negative paths, reset and blocked CSP actions are observed
    And missing startup assets fail closed
    And ordinary verification never rewrites published observations
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures browser proof
