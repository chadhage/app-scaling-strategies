Feature: K-C005 hermetic publisher binding repays the C005 publisher-pin quality debt
  K-C005 / worker-K-C005 serves C005 [S]
  Zero credit; adds fixtures, tests and evidence only; no production source, sealed evidence or retained RED is edited

  Scenario: The two formerly failing checks fail because they hash the live private publisher
    Given publication-recovery-150.test.cjs and snapshot-refresh.test.cjs bind the parent-approved publisher version f6df80bd
    When the live publisher has since been replaced by a later approved version
    Then exactly those two checks fail on a SHA-256 mismatch of the live file
    And every other non-browser C005 check passes

  Scenario: The parent-approved publisher version is bound to an archived snapshot
    Given the sealed evidence records the parent-approved publisher version with its SHA-256 and byte length
    When the two checks hash the publisher entry of the read-only boundary
    Then they hash tests\fixtures\publish-f6df80bdafc0.ps1.txt and never .git\kanban-orchestrator\publish.ps1
    And the snapshot's bytes and SHA-256 equal the recorded version exactly
    And the helper and Admin entries are still hashed from their own unchanged files

  Scenario: The checks never touch the live publisher
    Given a preload guard that fails any access to .git\kanban-orchestrator\publish.ps1
    When both formerly failing checks run in fresh Node processes under the guard
    Then both pass
    And the guard demonstrably fails a direct access, so the pass is not vacuous

  Scenario: The archived snapshots retain the publication guarantees the card relied on
    Given the exact parent-approved snapshot and the copy of the publisher that was live when K-C005 ran
    Then each digest equals the digest in its file name
    And each admits C005 as S in its closed map
    And each serializes under the named mutex, refuses to stage unless main equals remote, and requires the card and class message prefix
    And each commits only the named paths, adds the Copilot co-author trailer, tags annotated kanban/CardId/sha12 and pushes atomically
    And none resets, amends, forces or stages everything
