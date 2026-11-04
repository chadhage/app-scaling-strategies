Feature: C018 reopens actual C015 run progress without changing it
  C018 is the original S, P0, LP-REPLAY card, with parents H004 and H008.
  Training rehearsal - synthetic data - not a live Azure result
  H004, H008, native qualification and production Node 24 remain incomplete.

  Background:
    Given accepted C015 is Done and C001, C002 and C015 are unchanged
    And C015 owns its existing versioned schema and public restore(namespace, runId)
    And current mutex-protected C001 and explicit C015 fixture consent match exactly
    And only fixture setup invokes C015 public persist in a previously absent test-UUID
    And cleanup removes only that invocation's explicitly tracked files and empty directories
    And no retained demonstration, category root, other UUID or shared source is modified

  Scenario: A genuinely fresh reader reopens the actual prepared run by its exact ID
    Given a real C015 writer has exited after acknowledging synthetic-run-001 epoch 1
    When a new C018 reader process calls C015 restore for the same namespace and ID
    Then its exact disk state and acknowledgment match the actual writer receipt
    And state.record.status is prepared
    And state.record.completedStep is prepare and state.record.pendingStep is advance
    And the reader writes nothing and does not create a default run

  Scenario Outline: Reopened progress uses observed fields, not a bundled catalogue
    Given C015 has actually acknowledged contiguous epochs through <epoch>
    When a fresh process reopens <runId> in that same explicitly selected namespace
    Then its version, ID, epoch, state, acknowledgment, digest and history match disk exactly
    And the observed status is <status>, completed step is <completed>, pending step is <pending>
    And inspection permits only reread and presentation clearing, never executing a pending step
    Examples:
      | runId             | epoch | status    | completed | pending |
      | synthetic-run-001 | 1     | prepared  | prepare   | advance |
      | synthetic-run-001 | 2     | running   | advance   | finish  |
      | synthetic-run-001 | 3     | completed | finish    | none    |
      | synthetic-run-002 | 1     | prepared  | prepare   | advance |
      | synthetic-run-002 | 2     | running   | advance   | finish  |
      | synthetic-run-002 | 3     | completed | finish    | none    |

  Scenario: Unknown or absent runs cannot reuse a previous success
    Given this client has inspected an actual known run
    When an unknown, differently cased, blank, missing, wrong-type or extra ID is supplied
    Then it fails explicitly and the current progress display is unknown
    And no cached state is shown as current and no file is created
    And earlier errors and unknown inspections remain in this client's inspection journal

  Scenario: C015 failures and unobserved publication do not become progress
    Given C015 public persist created an owned interrupted publication at a supported test fault
    When a fresh C018 process reopens that same fixture
    Then C015 HOLD_UNOBSERVED and its exact details remain explicit
    And there is no previous-epoch success fallback, automatic repair, cancellation or reset
    And missing state, corrupt JSON, schema, marker, consent and storage errors are never success
    And error-plumbing unit checks are labelled separately from actual disk fault observations

  Scenario: Reconnection rereads the same run rather than cancelling or resetting it
    Given a signed Edge client has inspected synthetic-run-001 with pending work
    When keyboard Reconnect rereads the same ID through a new actual reader process
    Then the same state, acknowledgment, epoch and pending step are observed with a different PID
    And a separately fresh Edge client also reads the same unchanged disk progress
    And an actual closed-listener attempt clears stale current success and reports unknown
    And a new owned listener and fresh client can inspect that same run and epoch
    And the failed connection remains failed in retained raw evidence, not an uninterrupted result

  Scenario: The actual browser is a read-only inspector
    Given a currently approved caller-owned Node server bound to literal 127.0.0.1 port 0
    When signed installed Edge loads the owned C018 page through real buffered HTTP forwarding
    Then keyboard controls expose exact disk state, acknowledgment, history and pending fields
    And unknown IDs and read failures are visible without fabricated authentication or versions
    And Reset display clears only current presentation and returns focus to the run ID
    And reset and later success retain this client's earlier failed or unknown inspections
    And a new client explicitly cannot recover another client's inspection journal from C015
    And closed GET/HEAD routes reject foreign Host, Origin, paths, writes and redirects
    And real browser CSP blocks inline script, connections outside the owned origin and forms
    And browser and exact owned listener handles are awaited closed in finally

  Scenario: Static files have no current disk observation
    When the page is opened as a static file without its own approved listener
    Then current progress is explicitly UNKNOWN and reading and reconnecting are disabled
    And no bundled state, simulated reconnect or local-storage fallback supplies progress

  Scenario: Verification and evidence stay honest and immutable
    When normal focused, syntax or browser verification runs
    Then C018 source and evidence and all dependency source and retained fixture bytes are unchanged
    And C015 setup uses independent unique UUIDs and exact tracked cleanup
    And only literal CAPTURE_BROWSER_EVIDENCE=1 permits one deliberate unique browser capture
    And genuine loadable-stub RED, every failed attempt and raw CRLF bytes are retained
    And canonical Git bytes are checked separately without rewriting historical evidence
    And no new persisted schema, storage, package, IaC, cloud, identity, deployment or spend is added
    And only parent acceptance can award this original card's single S credit
