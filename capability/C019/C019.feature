Feature: C019 typed failures and honest read-only recovery
  C019 is one original S / P0 / H004 unit, gated by accepted C015.
  Training rehearsal - synthetic data - not a live Azure result
  Browser fixtures are historical teaching observations, never live disk recovery.

  Scenario: A genuine C015 error cannot become an accepted recovery
    Given the unchanged C015 public restore API reports STATE_MISSING
    When the console receives that typed observation
    Then the outcome remains failed with the original error code
    And a fabricated success or unsupported action is rejected
    And no error, pending context, acknowledgment, or history is deleted

  Scenario Outline: Actual C015 process and API failures remain explicit
    Given a unique test-UUID fixture created only by the approved C015 API
    And any earlier acknowledged epoch bytes have been recorded
    When the real C015 API observes <condition>
    Then the exact typed code is <code>
    And the console preserves the known run, epoch, pending step, and explicit unknowns
    And previous acknowledged bytes remain identical
    And only tracked owned test files and empty test directories are cleaned
    Examples:
      | condition                  | code               |
      | missing state              | STATE_MISSING      |
      | unknown run                | UNKNOWN_RUN_ID     |
      | partial exit before ack    | HOLD_UNOBSERVED    |
      | flushed exit before ack    | HOLD_UNOBSERVED    |
      | published exit before ack  | HOLD_UNOBSERVED    |
      | malformed owned epoch      | CORRUPT_JSON       |
      | retry of acknowledged epoch| STALE_EPOCH        |
      | invalid epoch input        | UNKNOWN_EPOCH      |
      | invalid closed input       | CLOSED_SCHEMA      |

  Scenario: Read-only reinspection is bounded and is not repair
    Given an unresolved typed error and an exact current revision
    When the learner reinspects at most three times
    Then historical replay is explicitly labelled historical
    And actual Node inspection calls only the unchanged C015 restore API
    And a good read is data observed, not a claim that the earlier failure recovered
    And held or corrupt state never falls back to a previous success
    And stale revisions, substituted context, and further reads are rejected

  Scenario: Review acknowledgment and stop preserve failure
    Given a typed failure requiring operator review
    When the learner confirms that operator review is needed or stops
    Then neither action reports review completed, recovery confirmed, or write authorized
    And repairing, deleting, marker reclaim, rollback, reinitialization, undo, and write actions are unavailable
    And inspectable history is append-only and bounded without eviction

  Scenario: Unknown or hostile values fail closed without retention
    Given missing context, unknown codes, accessors, or extra success-shaped fields
    When they reach the closed console boundary
    Then explicit unknown or rejected notifications are shown
    And no arbitrary exception message, path, stack, details, or rejected input is retained
    And no value is coerced and no default success is supplied

  Scenario: Signed Edge keyboard, errors, reset and CSP are actually observed
    Given the approved isolated lesson helper and installed signed Edge
    When Tab and Enter inspect an actual captured error and choose read-only actions
    Then the exact training banner and historical limits are visible in the DOM
    And unknown selections and forbidden actions visibly reject without losing history
    And reset changes presentation and focus only, retaining the unresolved failure
    And CSP blocks inline scripts, connections, workers, frames, and forms
    And the awaited finally closes the owned browser and cleans its session

  Scenario: Verification and publication do not alter dependencies or historical proof
    Given source, evidence, C001/C002 and retained C015 bytes are recorded
    When normal focused, browser, or syntax verification runs
    Then those bytes are unchanged and explicit fixture IO is cleaned
    And only exact CAPTURE_BROWSER_EVIDENCE=1 creates new uniquely named evidence
    And genuine RED and failed raw outputs remain immutable
    And raw working CRLF and Git-canonical bytes have distinct hashes
    And the exact approved standard publisher publishes only capability\C019
    And parent acceptance alone can award one S and zero extra credits
    And IaC, H004/H008, native results, and production Node 24 remain incomplete
