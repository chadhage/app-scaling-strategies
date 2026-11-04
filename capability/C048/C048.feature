Feature: C048 actually gates local DATA and EVENT admission
  Original C048 is one frozen D unit, P0, with original parent H009.
  Entry gates are accepted unchanged C021 and C023, with read-only C020 lineage.
  This is an in-memory admission model, not an Azure capacity or control API.
  The exact banner is "Training rehearsal - synthetic data - not a live Azure result".

  Scenario: Compatible implementation labels are not breaking API versions
    Given an explicit getProfile/1 candidate from either C020 implementation
    And the declared unchanged old-profile/1 DATA consumer
    And the exact C023/1, profile-effects/1 modeled EVENT consumer
    When a fresh typed admit command reaches the private session
    Then validated local eligibility runs before the admission transition
    And one local admission and three C023 modeled effect applications are recorded
    And an expansion of that same release revalidates both tiers without another effect application

  Scenario: The actual old consumer blocks the actual transition
    Given raw C021 getProfile/2 and the unchanged old-profile/1 consumer
    And no explicit adapter
    When admit or expand is requested even after a successful inspection
    Then the unchanged oldConsumer rejects CONTRACT_MISMATCH
    And the command is rejected with DATA_INCOMPATIBLE
    And no admission, expansion, or modeled effect application is added
    And the original rejection and any earlier admission remain in history

  Scenario: Only an explicit validated adapter permits that old consumer
    Given raw C021 getProfile/2 and old-profile/1
    When C021/getProfile-2-to-1/r1 is explicitly selected
    Then unchanged C021 adaptToOld validates the exact source before oldConsumer reads it
    And all original profile business fields are preserved
    And no adapter is silently chosen, repeated, or applied to a new consumer

  Scenario: EVENT and work contracts are closed local model contracts
    Given the declared profile-effects-consumer/1
    When its state schema or work version is incompatible, unknown, missing, or malformed
    Or its evidence is unknown rather than an exact modeled C023 plan
    Then the local admit or expand transition is blocked before C023 run
    And its counters and previous job remain unchanged
    And fixture acceptance is not described as real queue, protocol, database, or storage proof

  Scenario: Every consumer and evidence field must be explicit
    When an undeclared DATA or EVENT consumer, declaration mismatch, unknown implementation,
      unknown profile, extra field, missing field, malformed JSON, coercive value, accessor,
      custom prototype, sparse array, cycle, symbol, or oversized input reaches the guard
    Then the request fails closed without a positive unknown/default outcome
    And caller verdict, provenance, runtime health, HTTP status, capacity, authorization,
      and business acknowledgment are not admissible compatibility input
    And valid bounded rejected requests retain their original candidate text

  Scenario: Inspection never grants admission authority
    Given an eligible inspection at one session revision
    When evidence changes or an older expectedRevision is used
    Then admit and expand recompute eligibility from the current complete candidate
    And a stale inspection or supplied eligible verdict cannot authorize a transition
    And imported, edited, or coherently rewritten snapshots are never adopted

  Scenario: Private replay, identity, and history limits fail closed
    Given a session with detached frozen snapshots and a replayed private operation journal
    When a request ID is reused, a release identity is reused after reset,
      expansion precedes admission, another release is expanded, or a history limit is reached
    Then no admission or effect is added
    And history is not truncated to make the operation fit
    And verification is bounded to 64 retained operations

  Scenario: Native keyboard and reset retain history
    Given the resource-free file browser starts with no admission and explicit visible controls
    When Tab and Enter conduct inspection, admission, expansion, and a rejected request
    Then visible focus, live status, and an alert expose the actual local transition
    When the native type=reset button is activated with Enter
    Then the form's declared starting values are restored by native reset behavior
    And the active admission is archived, not resumed or erased
    And all inspections, rejections, accepted jobs, and lifetime effect counts remain exportable
    And stale inspection/status text does not remain a permit

  Scenario: Ordinary verification is read-only and browser evidence is authentic
    Given existing Node 22, offline Playwright 1.56.1, signed Edge 156,
      and published openIsolatedLesson helper SHA256 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
    When ordinary scoped checks or a browser rerun execute
    Then evidence bytes are unchanged and no network request, cloud call, or unsafe flag is used
    And the exact isolated browser is closed in an awaited finally
    When and only when CAPTURE_BROWSER_EVIDENCE equals the exact string 1
    Then new uniquely named raw proof may be created without replacing previous proof
    And original assertion RED, any raw failures, raw CRLF, and Git-canonical bytes are retained distinctly

  Scenario: Remaining native and integration scope is not silently completed
    Then H009 routing, audience authorization, cohorts, promotion and fresh external evidence,
      its source parents H003 H005 H008, native event or storage behavior,
      Azure capacity/control integration, and production Node24 remain incomplete
    And tests, repairs, proof, and refinement earn no additional Kano unit
    And only the parent may accept this one original C048 D mission
