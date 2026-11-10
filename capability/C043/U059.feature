@U059 @U058 @C043 @test-tooling @offline @zero-credit
Feature: Prove a requested resource-test stall through armed counted observation
  A native event-loop histogram can miss a block before its first sample.
  A small measured lag is not proof that a requested block was not exercised.
  This repair changes only test tooling, not the C043 service or page.

  Background:
    Given all 13 production files and all original C043 and U058 evidence have exact byte identities
    And the current pre-repair stall and load tooling is retained without changing its bytes
    And the U058 impasse submission and every failed raw observation remain immutable
    And child Node environments remove NODE_TEST_CONTEXT and NODE_V8_COVERAGE

  @specification-first @deterministic-red
  Scenario: The current tooling consumes the first stall before observation is armed
    Given the actual retained preload runs with a bounded injected clock
    And a connection arrives before the child's listening observation is armed
    When the listening notification arms observation and another connection arrives
    Then no requested block is consumed before arming
    And one requested block starts and completes in the armed phase
    And the assertion fails on the retained current tooling for its pre-arm consumption
    And this deterministic named assertion RED is archived before changing tooling
    And old 76ms and 105ms lag failures remain observations, not this new behavioral RED

  @unchanged-replay
  Scenario: The identical assertion passes on the repaired tooling
    Given the immutable RED assertion and its injected-clock fixture
    When the assertion runs against the repaired preload
    Then a pre-arm connection consumes no block
    And the armed connection records exactly one request, start, block call and completion
    And the retained original still reproduces the named assertion RED

  @arming @phase-counts
  Scenario: Every requested flood phase has explicit exercised facts
    Given listening arms observation before its caller receives readiness
    And reset arms a new phase before the caller receives the reset acknowledgment
    When the two declared resource flood kinds run
    Then each kind reports its own armed phase
    And each phase reports exactly one request, start, block call and completion
    And repeated connections cannot duplicate the requested block
    And incomplete, missing, duplicate or unarmed facts fail by name

  @injected-clock @no-absolute-duration-oracle
  Scenario: Native lag is diagnostic only
    Given injected clock and block adapters record the requested work
    When a native histogram reports zero or small lag
    Then complete armed counter facts still verify
    And a large native lag cannot rescue a missing or incomplete block
    And no elapsed time or absolute event-loop lag threshold decides success
    And an injected clock fixture proves the work request and counter transitions deterministically

  @isolation @failure-cleanup
  Scenario: Observation does not adopt a neighbour's phase
    Given two independent caller-owned observation instances
    When their connections and resets interleave
    Then the phase counts remain independent
    And a throwing block is incomplete rather than success
    And all real child and peer helpers close through their existing finally ownership paths

  @authority @joint-candidate
  Scenario: Both zero-credit cards retain separate proof in one exact joint namespace
    Given the U058 feature, original assertion RED and raw captures remain intact
    When U059 supersedes exact test and verifier bytes through append-only authority
    Then the new chain links the immutable U058 head to exact current test bytes
    And its checker and complete newest amendment have an independent head anchor
    And historical inputs resolve to retained bytes rather than new code
    And every original, U058 and U059 manifest and transcript is verified
    And the required whole suite and unchanged original RED/final replay pass
    And each card has its own feature, RED, evidence, result and file accounting
    And all 13 production files and historical evidence stay byte-identical
    And new public bytes use repository-relative paths or placeholders
    And only the coordinator reviews, publishes and decides separate Done transitions
    And installed157 remains unqualified here and U034 is not run
    And no reader-complete, application-completion or additional satisfier credit is implied
