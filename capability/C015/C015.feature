Feature: C015 restores acknowledged synthetic run and epoch state from real files
  C015 is one original D, P0, packet H001, entry C001, parents H001 and H004.
  Training rehearsal - synthetic data - not a live Azure result
  The approved production architecture remains Node 24 / Express / Azure Tables.
  This separately approved Windows local filesystem fixture is not that architecture.

  Background:
    Given C001 and C002 are accepted immutable contracts consumed without edits
    And current C001 consent matches the C001 guard's pinned approval exactly
    And current approvals.C015.approved is the literal boolean true
    And scoped C015 approval forbids real user data, credentials, cloud, deploy and spend
    And the only writable targets are named C015 synthetic fixtures or unique test scratch
    And the operating envelope is one cooperative writer on a local regular-file filesystem

  Scenario: A genuinely new process restores every acknowledged field
    Given a previously absent unique owned test fixture
    When a real writer process publishes synthetic-run-001 epoch 1
    And a different writer process publishes epoch 2
    And each acknowledgment follows actual file writes, regular-file flushes and publication
    And those writer processes have exited
    When a fresh reader process opens the files without a writer's memory
    Then the restored version, run ID, epoch, envelope, record and acknowledgment match exactly
    And both immutable epoch files still exist
    And no read reinitializes or writes state

  Scenario: Missing state is not reconstructed from the synthetic catalogue
    Given no persisted run in an existing owned fixture
    When a fresh process attempts restoration
    Then restoration fails explicitly with STATE_MISSING
    And it neither returns a success nor creates a default run

  Scenario Outline: Current consent does not coerce or supply defaults
    Given current <approval> is <value>
    When a fixture mutation is attempted
    Then it is rejected visibly before the first fixture write
    And a browser snapshot cannot supply authority
    Examples:
      | approval                                  | value       |
      | C001.designAndLocalImplementationApproved  | false       |
      | C001.designAndLocalImplementationApproved  | missing     |
      | C001.designAndLocalImplementationApproved  | string true |
      | C015.approved                              | false       |
      | C015.approved                              | missing     |
      | C015.approved                              | string true |

  Scenario: Inputs and paths are closed synthetic contracts
    When traversal, absolute paths, unknown fixture or run IDs, unknown epochs, wrong types,
      stale epochs, additional fields, symlinks, hard-linked files or oversized state are supplied
    Then the operation fails explicitly without creating or acknowledging that input
    And C002 validates the reused versioned run envelope with current C001 consent

  Scenario Outline: An owned child exits before acknowledgment
    Given epoch 1 was acknowledged and its bytes were retained
    When a real writer child exits at <stage> while attempting epoch 2
    Then the parent observes no acknowledgment for epoch 2
    And a fresh reader reports HOLD_UNOBSERVED rather than a success-shaped fallback
    And the original verified epoch 1 bytes remain unchanged
    Examples:
      | stage                  |
      | after-partial-write    |
      | after-flush            |
      | after-publish          |

  Scenario: Corruption and incomplete histories cannot silently reset a run
    Given previously acknowledged state
    When state has malformed or duplicate JSON, a bad digest, wrong schema, missing history,
      a partial publication, an unexpected file or a mismatched acknowledgment
    Then a fresh process fails or holds explicitly
    And no acknowledgment, empty ledger, reset or reinitialization is fabricated

  Scenario: The browser is read-only evidence inspection, not filesystem execution
    Given a separately recorded real writer and fresh reader observation
    When the signed installed Edge browser opens the owned static page
    Then keyboard inspection shows the exact synthetic run, epoch, digest and process evidence
    And the page labels the bundled observation as not a live disk read or restart
    And unknown IDs and Azure scope requests fail visibly
    And reset only clears the display and restores keyboard focus
    And CSP blocks network, inline script, forms, frames and workers
    And no HTTP mutation API, authentication service or storage SDK exists

  Scenario: Verification retains evidence and uses only explicit owned test cleanup
    When ordinary focused and browser verification are rerun
    Then source, committed fixtures and historical raw evidence stay byte-identical
    And only explicitly created resolved scratch files and subdirectories are removed
    And only exact CAPTURE_BROWSER_EVIDENCE=1 permits a unique deliberate raw capture
    And raw CRLF bytes and Git canonical contract bytes are verified separately
    And no tests, refinements or repeated proofs receive additional Kano credit
