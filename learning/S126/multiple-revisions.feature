Feature: A bounded multiple-revision canary, preview and retirement rehearsal
  All revisions, weights, identities, readiness, routing, requests, work,
  state and retirement values are fixed fictional teaching DATA ONLY.
  No action invokes ACA, a registry, Azure, identity or deployment services.

  Background:
    Given the exact banner "Training rehearsal - synthetic data - not a live Azure result"
    And fictional old r1, canary r2 and preview r3 are distinct immutable records
    And the ordinary allocation starts at old 100, canary 0, preview 0
    And the preview label selects r3 independently of ordinary traffic weights
    And each run retains at most 20 actions without pruning existing evidence

  Scenario: A software token and a successful probe are not readiness
    When the operator records exact token v2 with the probe-only fixture
    Then the candidate identity is recorded without observing readiness or migration
    When the operator inspects all fictional readiness observations
    Then the failed dependency prevents weighted exposure despite successful probes
    And missing readiness is unknown rather than a positive result

  Scenario Outline: Preview authorization includes selected and non-selected paths
    Given the candidate and preview passed the declared readiness gates
    When the operator measures the <fixture> preview fixture
    Then selected login and callbacks preserve identity and state
    And ordinary production navigation does not enter the preview revision
    And visitor and non-selected authenticated direct-label access are denied
    And the result is <verdict>
    And zero ordinary preview weight never certifies authorization
    Examples:
      | fixture         | verdict |
      | healthy         | pass    |
      | preview-leak    | fail    |
      | callback-broken | fail    |
      | preview-unknown | unknown |

  Scenario: Weighted canaries are bounded samples, not universal migration
    Given fresh readiness and measured preview authorization passed
    When the operator selects the fixed 80/20/0 split
    Then only desired traffic DATA changes until a separate measurement
    When the operator measures the canary requests and complete journeys
    Then actual revision identities and outcomes are reported independently
    And successful old-only requests do not prove those users migrated
    And promotion is held after failed or unknown canary evidence
    And each split invalidates the earlier preview authorization result
    And measurements independently recheck current preview and production paths

  Scenario: Earlier preview authorization cannot certify access after promotion
    Given selected and non-selected paths passed before weighted exposure
    When all promotion request and journey DATA pass but a non-selected preview path leaks
    Then the fresh preview verifier fails despite zero ordinary preview weight
    And old revision retirement remains held
    And compatible rollback rechecks preview authorization and old production navigation

  Scenario Outline: Zero old weight alone cannot retire the old revision
    Given the healthy canary sample passed
    When the operator selects fixed 0/100/0 and measures promotion
    And the operator audits <fixture> old routing, clients, requests and work
    And the operator requests teaching retirement
    Then retirement is <retirement>
    And attempted, interrupted and unknown journeys remain in the denominator
    Examples:
      | fixture       | retirement |
      | healthy       | allowed    |
      | pinned-old    | held       |
      | route-unknown | held       |
      | old-work      | held       |
      | drain-unknown | held       |
      | journey-unknown | held     |

  Scenario: Compatible rollback preserves earlier failure evidence
    Given the candidate-fault canary measurement contains an interrupted journey
    When the operator requests rollback
    Then fresh old readiness, capacity and state compatibility are inspected
    And measured rollback routes and journeys select the old revision
    And the earlier interrupted journey remains counted
    And rollback is held if compatibility is false or unknown
    And an already retired old revision is not silently resurrected

  Scenario: Only verified old routing, work, ownership and retention allow retirement
    Given the healthy promotion accounts for every member of the declared synthetic cohort
    And old ordinary, direct and label admission observations are zero
    And old sessions, requests, streams and jobs are independently observed zero
    And state, exactly-once effect, ownership, checkpoints and artifact gates passed
    And the fictional rollback-retention window is observed elapsed
    When the operator requests teaching retirement
    Then only the old r1 record is retired
    And r2 and independently authorized preview r3 remain active
    And no native Azure result or all-real-users claim is made

  Scenario: Strict input and state errors cannot mutate a run
    When command fields, types, tokens or fixture names are invalid
    Or a state, observation, history or metric is forged
    Then an explicit typed error is returned without mutating state or history
    And a twenty-first action is refused without discarding the first twenty

  Scenario: Actual browser behavior is accessible and safely recoverable
    Then native keyboard controls and visible focus work
    And safe holds, typed errors and missing-model failure are visible
    And prototype-based form reset survives a control named reset
    And reset restores only the in-memory fictional rehearsal
    And actual CSP denies inline script and events, eval, inline style,
      connections, images, frames and form navigation
    And verification does not rewrite source or prior evidence
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately adds browser evidence
