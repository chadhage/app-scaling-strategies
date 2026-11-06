Feature: K-C034 hermetic publisher binding and measured logic coverage repay the C034 quality debt
  K-C034 / worker-K-C034 serves C034 [S]
  Zero credit; adds fixtures, tests and evidence only; no production source, sealed evidence or retained RED is edited

  Scenario: The publisher check fails because it hashes the live private publisher
    Given tests\surface.test.cjs binds the approved publisher to the C034 pin publisherRawSha256 f6df80bd
    When the live publisher has since been replaced by a later approved version
    Then that one check fails on a SHA-256 mismatch of the live file
    And the other 26 non-browser C034 checks pass

  Scenario: The approved publisher is bound to its archived snapshot
    Given the C034 pins record the raw SHA-256 of the approved publisher
    When the check reads the publisher
    Then it reads tests\fixtures\publish-f6df80bdafc0.ps1.txt and never .git\kanban-orchestrator\publish.ps1
    And the snapshot's SHA-256 equals pins.publisherRawSha256 exactly
    And the closed-path, Admin, remote-before-stage and CRLF-aware guards the check asserted still hold on the snapshot

  Scenario: The check never touches the live publisher
    Given a preload guard that fails any access to .git\kanban-orchestrator\publish.ps1
    When the check runs in a fresh Node process under the guard
    Then it passes
    And the guard demonstrably fails a direct access, so the pass is not vacuous

  Scenario: The archived approved snapshot and the K-time copy both admit C034 as S
    Given the exact approved snapshot and the copy of the publisher that was live when K-C034 ran
    Then each digest equals the pin or the digest in its file name
    And each keeps the mutex, message prefix, scoped commit, atomic push and co-author guarantees

  Scenario: The command line inspects only closed saved traces against exact sources and an exact known context
    Given hermetic fixtures for the accepted gates and the C015 restore built from the saved trace
    When inspect runs for each closed trace
    Then it prints the exact saved originals, a read-only known context and every adoption flag false
    And an unknown action, ID or extra argument, a changed saved source, a stale state, digest or acknowledgment, an invalid inspection and an error without a code each print one closed failure with exit 1

  Scenario: Saved history, accepted gates and the known context are read only from exact sources
    Given fresh instances of the historical reader whose gates, store, pins or trace come from fixtures
    When a state element is missing or duplicated, a panel differs, a snapshot is invalid, the report leaves the exact browser scope, a gate drifts in any field or the restore is not the closed read-only fixture
    Then each is refused with its own closed code and the bundle holds both closed traces otherwise

  Scenario: Pinned sources and the saved trace fail closed on every unsafe, drifted or unknown input
    Given unique scratch sources inside the owned namespace
    When a pin is outside the capability tree, reached through a junction, a directory, hard-linked, oversize, drifted in raw or normalized bytes, changed while read, absent from the accepted Git commit or hashes differently from its Git pin
    Then each is refused with its own closed code
    And the saved trace loads only from its exact regular, single-link, in-place bytes
