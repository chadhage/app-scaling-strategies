@A-S003 @S003 @D-S003 @LP-RINGS @synthetic
Feature: Advance a staged canary only with fresh journey evidence
  Training rehearsal - synthetic data - not a live Azure result
  The SOURCE exercise uses 20 invented users, baseline v1, candidate v2,
  stages 5%, 25%, 50%, 100%, a 30-second simulated observation window,
  a 60-second evidence lifetime and a 1000-ms complete-journey budget.
  Preconditions are synthetic readiness, compatible state/authentication,
  overlap capacity and a retained v1 recovery destination.
  IaC is N/A: no Azure resource, runtime, authentication or hosting is approved.

  Scenario: Fresh complete journeys permit exactly the next increment
    Given the 5% stage has attempted the transition of user u01 from v1 to v2
    When I record a complete fresh safe observation for all 20 users
    Then u01 is observed on v2 with intact authentication, state and effects within 1000 ms
    And the other 19 users are observed unchanged on v1 and are not counted as migrated
    When I promote the next cohort
    Then desired traffic becomes 25% and only u02 through u05 join the attempted population
    And the next stage needs its own fresh observation before another increment

  Scenario: An HTTP 200 journey regression prevents the next increment
    Given the 5% stage is awaiting observations
    When I record u01 on v2 with HTTP 200 but 1400-ms journey latency
    And I attempt to promote the next cohort
    Then desired traffic remains 5% and no new user is exposed
    And the trace retains the blocked action and the failed attempted transition
    And passing the negative safety check is not reported as uninterrupted migration

  Scenario: Authentication, state or business-effect failure also stops expansion
    Given the 5% stage has a fresh observation
    When u01 has a failed authentication, state or exactly-once effect assertion
    Then the next increment is prohibited even if HTTP status and latency are acceptable

  Scenario Outline: Insufficient evidence fails closed
    Given the 5% stage is awaiting observations
    When I record the <fixture> fixture
    And I attempt to promote the next cohort
    Then desired traffic remains 5%
    And the gate explains <reason> without a success-shaped fallback
    Examples:
      | fixture      | reason                                    |
      | missing      | missing observations                      |
      | unknown      | an unknown attempted journey outcome      |
      | partial      | desired routing differs from destinations |
      | stale        | evidence is older than 60 seconds         |
      | short-window | the observation window is incomplete      |

  Scenario: Evidence expires and cannot be reused by a later stage
    Given the 5% stage has a safe complete observation
    When the simulated clock advances 61 seconds
    Then promotion is blocked because evidence is stale
    When I record a new complete safe observation
    And I promote to 25%
    Then that observation remains in history but cannot authorize promotion to 50%

  Scenario: Failed and unknown outcomes survive later evidence and rollback
    Given an attempted transition has a failed or unknown recorded outcome
    When I record a later safe observation
    And I request synthetic rollback
    Then the attempted denominator and failed or unknown outcome are retained
    And desired traffic is 0% but actual rollback routing is not assumed
    And v1 and the prior trace remain available for inspection

  Scenario: Configured stages remain stable and bounded to the synthetic cohort
    Given I choose stages 10%, 30%, 60%, 100% and a 60-second observation window
    When each stage receives its own fresh complete safe observation
    Then exactly 2, 6, 12 and 20 distinct users have attempted migration in order
    And unchanged v1 users and already-moved v2 users do not become new migrations
    And no increment is available beyond 100%

  Scenario: Local cleanup and scope are distinct from verification and user impact
    Given I have inspected a blocked regression and its synthetic user impact
    When I explicitly clear the local rehearsal
    Then only in-memory lesson state is discarded
    And no credentials, network call, Azure management action or resource deletion occurs
    And the lesson claims neither B-S003 native proof nor complete D-S003 acceptance
    And neither the finite synthetic sample nor its result proves 99.999% reliability
