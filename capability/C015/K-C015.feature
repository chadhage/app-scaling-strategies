Feature: K-C015 hermetic publisher binding and measured logic coverage repay the C015 quality debt
  K-C015 / worker-K-C015 serves C015 [D]
  Zero credit; adds fixtures, tests and evidence only; no production source, sealed evidence or retained RED is edited

  Scenario: The publisher check fails because it hashes the live private publisher
    Given tests\surface.test.cjs binds the parent-approved standard publisher to SHA-256 91c8cf83dd07
    When the live publisher has since been replaced by a later approved version
    Then that one check fails on a SHA-256 mismatch of the live file
    And the other 31 focused C015 checks pass

  Scenario: The parent-approved publisher is bound to its archived snapshot
    Given publisher-boundary.json names the approved source snapshot and its digest
    When the check reads the standard publisher
    Then it reads evidence\publisher-current-63bcecef-149f-4317-a30e-61fd9b31b269.snapshot and never .git\kanban-orchestrator\publish.ps1
    And the snapshot's SHA-256 equals parentApprovedSha256 exactly
    And every guarantee the check asserted about the mutex, remote HEAD gate, scoped D commit, annotation and atomic push still holds on the snapshot

  Scenario: The check never touches the live publisher
    Given a preload guard that fails any access to .git\kanban-orchestrator\publish.ps1
    When the check runs in a fresh Node process under the guard
    Then it passes
    And the guard demonstrably fails a direct access, so the pass is not vacuous

  Scenario: The archived approved snapshots and the K-time copy retain the history the boundary records
    Given the superseded snapshot, the approved snapshot and the copy of the publisher that was live when K-C015 ran
    Then each digest equals the recorded digest or the digest in its file name
    And each admits C015 as D in its closed map
    And only the approved snapshot and the K-time copy add cr-at-eol to the command-local whitespace policy

  Scenario: The command line rejects every non-closed request without writing
    Given the only accepted requests are write RUN_ID EPOCH with epoch 1, 2 or 3 and read RUN_ID
    When the command line receives no action, extra arguments, a read with an epoch or a write with another epoch
    Then it prints one closed JSON failure with acknowledged false, restored false and code INVALID_ARGUMENTS and exits 1
    And a write for an epoch the committed demo namespace already holds fails with STALE_EPOCH and leaves every committed fixture byte unchanged
    And an unexpected error without a code is reported as CLI_FAILURE with no acknowledgment

  Scenario: Fixture paths are confined to the owned namespace and never follow links
    Given the demo namespace and unique test-only UUID namespaces under the owned root
    When a namespace, a traversal target, a symlink or junction, a non-directory ancestor, a hard-linked file or an unreadable ancestor is presented
    Then each is rejected with its own closed code and nothing outside the fixture is touched

  Scenario: Persistence and restoration fail closed on every unsafe or inconsistent history
    Given real fixtures built in unique test-only namespaces
    When files are missing, extra, oversized, replaced, republished or out of sequence
    Then each persist or restore fails with its closed code and no acknowledgment, reset or fallback state
