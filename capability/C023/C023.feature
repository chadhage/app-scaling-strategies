Feature: Inspect checkpointed synthetic work without inventing exactly-once delivery
  C023 is one frozen S unit, derived from H005 and P005 with accepted C020 as its entry gate.
  This portable fixture has no durable store, queue, database, external effect or cloud proof.

  Background:
    Given the unchanged immutable C020 getProfile/1 catalog and implementation stamps
    And an explicit job ID, work version, profile ID and source implementation
    And three deterministic synthetic effects belonging to that work identity
    And a local modeled atomic pair of effect application and deduplication ledger entry
    And checkpoints are separate later events, not atomic with the effect/ledger pair

  Scenario: Inspect real fixture lineage and a deterministic work plan
    When I create the job twice from the same configuration
    Then both frozen plans and initial snapshots are identical
    And the profile and source stamp come from C020 without a second profile catalog
    And no effect or checkpoint is reported as committed
    And work version, effect identities and planned versus committed counts are visible

  Scenario Outline: Resume across a controlled interruption
    When an attempt stops at "<boundary>" for any planned effect
    Then its original interrupted outcome and ordered events remain inspectable
    And only already committed effects count as known applications
    When I resume from the last recorded checkpoint without another interruption
    Then all three effects have exactly one application within this local model
    And a committed effect beyond that checkpoint is suppressed rather than applied again
    And the original failed attempt is not rewritten into success

    Examples:
      | boundary          |
      | before-commit     |
      | after-commit      |
      | before-checkpoint |
      | after-checkpoint  |

  Scenario: An unknown acknowledgment is not a successful commit
    When an attempt stops with an unknown acknowledgment
    Then the effect remains explicitly unknown and is not included in the known committed count
    And resume is blocked until a synthetic reconciliation observation resolves it
    When reconciliation still says unknown
    Then resume remains blocked and the original unknown outcome remains in history
    When a synthetic observation says committed
    Then one modeled effect/ledger pair is recorded with synthetic-reconciliation provenance
    And resume suppresses that known effect
    And neither the observation nor completion is called an external receipt or native guarantee

  Scenario: Reconciliation observes absence
    Given an unresolved unknown effect
    When a synthetic observation says absent
    Then no commit is fabricated
    And resume can attempt that effect once inside the local model

  Scenario: Reject invalid inputs and inconsistent saved state
    When identity, version, commands, checkpoint, counts, ledger, source data or journal are invalid
    Then a typed rejection is returned without mutating the original snapshot
    And caller accessors, extra fields, sparse arrays and non-JSON values are not accepted
    And an unknown acknowledgment cannot be converted into success by editing a projection

  Scenario: Immutable isolation and preserved conducting history
    Given two separately created jobs and a previous interrupted snapshot
    When one job resumes or the conducting page archives and resets it
    Then the other job and previous snapshot remain unchanged
    And reset preserves the archived job, original attempts and visible rejection history
    And snapshot inspection never replaces the active job with an older saved state
    And a browser reload is explicitly not durable recovery

  Scenario: Editing a candidate invalidates its previous inspection result
    Given a valid snapshot was inspected without replacing the active job
    When the candidate JSON is edited
    Then the previous valid result is visibly invalidated until another inspection
    And the earlier inspection remains in the retained evidence history

  Scenario: Conduct with a keyboard in a restricted file page
    When I create, interrupt, resume, reconcile, inspect a bad snapshot and archive using the DOM
    Then labeled controls are keyboard operable and outcomes are announced
    And stale success does not remain after a rejected operation
    And inline script and external network attempts are blocked by the page CSP
    And actual browser checks close their isolated browser in finally
    And ordinary verification does not modify historical proof
