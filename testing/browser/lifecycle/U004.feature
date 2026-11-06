Feature: End only the process tree the browser helper owns
  The bounded browser startup and close (U005, U006) must be able to stop what the helper started and nothing else.
  Ownership is a recorded identity (process id plus creation time) captured while the process is alive, never a bare
  process id, an image name or a marker in a command line. This is local test tooling for Windows; Edge is not involved.

  Background:
    Given a Windows host and only Node built-ins
    And every process in these scenarios is started by the test itself, so the test may end it and nothing else

  Scenario: A recorded tree contains exactly the live descendants of the root
    Given a fixture root that spawns two branches, each with one leaf, and a third branch with one leaf
    When the tree is snapshotted from the root while every process is alive
    Then the snapshot holds the root, its three branches and their three leaves as (pid, creation time) pairs
    And it holds no look-alike process

  Scenario: Descendants need a creation time not earlier than their parent
    Given a process whose parent id points at a pid that was reused by a younger process
    When the tree is snapshotted from that younger process
    Then the older process is not a descendant

  Scenario: Orphans recorded while their parent lived stay owned
    Given a snapshot recorded while a branch and its leaf were alive
    And the branch exits first so the leaf is an orphan
    When the owned tree is terminated
    Then the orphan is terminated and the exited branch is reported already gone

  Scenario: A marked fixture tree is terminated and nothing else
    Given a real marked Node tree and look-alike processes started beside it
    When the owned tree is terminated with a deadline
    Then every owned process is gone and reported terminated or already gone
    And a process with the same marker outside the tree survives
    And a process of the same image that is not owned survives
    And no kill was ever requested for a process outside the snapshot

  Scenario: A stale identity is refused, never killed
    Given a recorded pid whose creation time differs from the live process that now holds that pid
    When the owned tree is terminated
    Then that entry is refused with an identity mismatch and the live process survives

  Scenario: Verification and termination share one process handle
    Given the Windows helper is asked to end a pid with a wrong creation time
    Then it reports a mismatch and the process survives
    And a pid that no longer exists is reported gone

  Scenario: Already gone processes are not errors
    Given a recorded process that exited before termination
    When the owned tree is terminated
    Then it is listed as already gone and nothing is thrown

  Scenario: Termination is bounded by a deadline
    Given adapters that are slow or fail
    When the owned tree is terminated with a short deadline
    Then the call returns before the deadline with survivors and errors reported instead of hanging

  Scenario: The caller and its ancestors are never terminated
    Given a snapshot that names the calling process or one of its ancestors
    When the owned tree is terminated
    Then those entries are refused as protected and nothing is killed

  Scenario: Unverifiable processes are refused
    Given a live pid whose creation time cannot be read
    When the owned tree is terminated
    Then it is refused as unverifiable and not killed

  Scenario: The Windows mechanism is bounded and free of string interpolation
    Given one Windows PowerShell 5.1 helper per call fed through standard input
    Then pids and creation times never appear on a command line
    And a hung helper is ended at its deadline and reported as an error

  Scenario: Twenty repeated real runs leave nothing behind
    When the real-process scenario runs twenty times in a row
    Then every run reports zero owned leftovers, zero collateral damage and no failure
