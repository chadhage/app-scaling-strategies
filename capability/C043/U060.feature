@U060 @U059 @U058 @C043 @zero-credit @test-tooling @offline
Feature: Decide every C043 mutation by behavioral evidence without timer-based kills
  The complete original mutation set remains mandatory.
  A timed-out child is undecided, even when its partial output names a failure.
  An assertion awaiting an endlessly repeated failed step needs a structural observation.
  Production files, old raw captures and authority heads are immutable.

  Background:
    Given the live U060 contract is admitted under worker-U060
    And the original mutation runner and all old candidate files have exact byte identities
    And old480s and600s timeouts remain failed observations, not behavioral REDs
    And the complete original mutation names and replacements are retained
    And every nested Node child removes NODE_TEST_CONTEXT and NODE_V8_COVERAGE
    And mutation work holds one shared slot with at most two subprocess workers

  @specification-first @behavioral-red
  Scenario: The old runner counts a timed-out child as a killed mutant
    Given a controlled child emits a named assertion before a virtual timer expires
    And the virtual timer ends the child without a completed test summary
    When the actual retained mutation-runner callback evaluates the result
    Then the mutation is refused as undecided rather than killed
    And this assertion fails on the old callback's null-exit success bookkeeping
    And immutable raw stdout, stderr, exit and input hashes are recorded before repair

  @child-lifetime
  Scenario: Child exit cannot wait forever for inherited pipe closure
    Given a controlled child exits while a descendant keeps a stream open
    When the runner observes the exit
    Then the runner records the terminal event
    And caller-owned identities are cleaned before the result settles
    And open or incomplete streams are explicit failures, never success-shaped defaults
    And a missing executable or spawn error is an explicit failed result

  @structural-bound @no-production-edit
  Scenario: A failed-step mutation cannot starve the assertion that must detect it
    Given the real C043 loop normally advances at most the declared preset steps
    And the failed-step stopping guard is removed in a private in-memory mutation
    And the injected clock does not advance
    When the mutated loop repeatedly visits an unacknowledged failed step
    Then an injected test-only iteration bound exposes the behavior to a named assertion
    And the unmutated control never reaches that bound
    And all13 production files remain byte-identical
    And no elapsed duration decides whether the mutant was killed

  @exact-scope @positive-evidence
  Scenario: Every original mutation and generated position is accounted for
    When the complete required mutation gate runs
    Then every original name and replacement remains in the campaign
    And every applied mutation has positive application evidence
    And every kill has a completed named behavioral assertion
    And every survivor has a demonstrated equivalence or remains a failed gate
    And invalid input, missing application, syntax errors, crashes and timeouts are not kills
    And progress identifies each active and completed mutation
    And no subset or early return is described as the complete campaign

  @ownership @resource-limits
  Scenario: Two workers and neighbouring instances remain isolated
    Given two child runs and an unrelated neighbour
    When completion, assertion failure, timeout and repeated cleanup interleave
    Then only recorded caller-owned PID and creation-time identities may be ended
    And the neighbour remains untouched
    And at most two subprocess workers run per mutation-slot holder
    And the held mutation and heavy slots are released in finally

  @authority @full-replay
  Scenario: The exact repaired verifier remains independently reviewable
    When the repaired runner and tests pass the unchanged behavioral RED replay
    Then append-only exact-byte amendments link to the preserved D1-D4 and head
    And changed verification bytes retain their exact predecessors
    And every original and U058/U059/U060 manifest is recomputed
    And full and fresh current-candidate gates pass without repinning old captures
    And each card retains separate specification, RED, result and file accounting
    And only the coordinator accepts and publishes under existing C043[S]
    And U059 and U058 remain actual prerequisite-gated work until independent acceptance
    And no installed157 qualification, U034 execution or reader/application signal is implied
