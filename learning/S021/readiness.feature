@A-S021 @S021 @D-S021 @SC-S021 @synthetic
Feature: Admit only a completely evidenced required candidate pool
  One healthy reply does not establish per-instance readiness.
  This SOURCE-only lesson does not conduct B-S021 or complete D-S021.

  Background:
    Given the visible banner is "Training rehearsal - synthetic data - not a live Azure result"
    And the synthetic deployment identity is "candidate-v2"
    And the fixed synthetic clock is 120000 milliseconds
    And readiness evidence is fresh for at most 30000 milliseconds, inclusive
    And the required routing pool is "candidate-a, candidate-b, candidate-c"
    And "candidate-shadow" is optional and excluded from the required routing pool
    And each required candidate must evidence the required dependency "primary-store"
    And the dependency "recommendations" is optional
    And no users, credentials, network requests, or management APIs are involved

  Scenario: Every required candidate is fresh-ready despite optional failures
    Given all 3 required candidates have identity-bound ready evidence at 115000
    And their required primary-store checks are ready
    And candidate-shadow is failed
    And recommendations is failed on every candidate
    When I choose "All required fresh-ready"
    Then admission is "ALLOW" in the synthetic model only
    And the verifier reports PASS for expected ALLOW
    And the trace includes 3 "candidate.ready" events
    And the trace includes "candidate.optional.excluded" for candidate-shadow
    And optional dependency failures are reported as "dependency.optional.ignored"
    And the final gate event is "admission.allow"
    And no completed migration or reliability certification is claimed

  Scenario: One required candidate is unready
    Given candidate-a and candidate-c have fresh ready evidence
    And candidate-b has fresh unready evidence
    And a healthy endpoint sample was returned by candidate-a
    When I choose "Make one candidate unready"
    Then admission is "BLOCK"
    And the verifier reports PASS for expected BLOCK
    And the trace includes "candidate.unready" for candidate-b
    And the trace ends the gate with "admission.block"
    And no candidate users are admitted

  Scenario: A misleading healthy sample cannot fill absent per-instance evidence
    Given candidate-a has fresh ready evidence
    And candidate-b has no evidence
    And candidate-c has unknown evidence
    When I choose "Healthy sample only"
    Then the endpoint sample is visibly healthy
    But admission is "BLOCK"
    And the trace includes "sample.informational"
    And the trace includes "candidate.missing" for candidate-b
    And the trace includes "candidate.unknown" for candidate-c
    And unknown remains unknown rather than being converted to ready

  Scenario Outline: Invalid required evidence blocks admission
    Given candidate-a and candidate-c have fresh ready evidence
    And candidate-b has <condition>
    And a healthy endpoint sample was returned by candidate-a
    When I evaluate the required routing pool
    Then admission is "BLOCK"
    And candidate-b is classified as <classification>
    And the trace includes <event> for candidate-b

    Examples:
      | condition                              | classification | event                       |
      | ready evidence at 89999                 | unknown        | "candidate.stale"           |
      | no evidence                            | unknown        | "candidate.missing"         |
      | fresh unknown evidence                 | unknown        | "candidate.unknown"         |
      | fresh failed evidence                  | not_ready      | "candidate.failed"          |
      | a missing candidate record             | unknown        | "candidate.missing-record"  |
      | ready evidence from another deployment | unknown        | "candidate.identity"        |
      | ready evidence in the future           | unknown        | "candidate.clock"           |
      | duplicate records for candidate-b      | unknown        | "candidate.duplicate"       |

  Scenario: Freshness has an explicit boundary
    Given all required evidence is otherwise ready
    When candidate-b's evidence age is exactly 30000 milliseconds
    Then admission is "ALLOW"
    When candidate-b's evidence age is 30001 milliseconds
    Then admission is "BLOCK"
    And the old ready observation is still shown as stale, not current readiness

  Scenario: Required dependencies are not optional by accident
    Given all required candidate process checks are fresh-ready
    When candidate-b's primary-store evidence is missing, failed, or unknown
    Then admission is "BLOCK"
    And the trace identifies that required dependency on candidate-b
    But a failed optional recommendations dependency alone does not block the pool

  Scenario: A missing or stale aggregate sample is not a blanket gate either
    Given every required candidate has fresh ready identity-bound evidence
    When the aggregate sample is missing or stale
    Then the sample uncertainty is visible
    And admission is "ALLOW" in this narrowly scoped synthetic model
    And route correctness and end-to-end user impact remain unknown

  Scenario: An empty or ambiguous required pool is not vacuously safe
    Given the required routing pool is empty or contains duplicate identities
    When I evaluate the pool
    Then admission is "BLOCK"
    And the trace reports an invalid required-pool contract

  Scenario: Keyboard editing changes the observed verdict and prediction check
    Given the all-required-fresh-ready preset is selected
    When I use labeled keyboard-operable controls to select candidate-b
    And I change its condition to "Unready" and apply the condition
    Then the live admission result changes from ALLOW to BLOCK
    And a prediction of ALLOW reports FAIL without changing the admission gate
    When I change the expected admission to BLOCK and check the prediction
    Then the verifier reports PASS
    And I can inspect the changed per-instance row and synthetic trace

  Scenario: Verification, user impact, and cleanup are distinct
    When any synthetic scenario is evaluated
    Then the verification verdict only compares the expected and modeled admission
    And actual user-visible errors or timeouts are "unknown"
    And actual journey latency is "unknown"
    And actual authentication, session, navigation, and asset continuity are "unknown"
    And actual missing or duplicate business effects are "unknown"
    And actual data freshness, ordering, and consistency are "unknown"
    And attempted user transitions are 0 and no success percentage is calculated
    And cleanup says only in-memory inputs were used and no resources were created
    And reset restores the deterministic unready fixture
    And IaC is N/A because no Azure resource or runtime/auth/hosting approval exists
