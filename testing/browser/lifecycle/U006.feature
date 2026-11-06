Feature: Make close() unable to hang, and always end the owned browser tree
  The sealed session close awaits context.close() before browser.close(), so a stuck context blocks shutdown for ever, and it removes
  the scratch directory only after both. U006 wraps the session that the bounded startup (U005) returns: the graceful close is bounded by an
  injected deadline, then the owned process tree is ALWAYS ended by identity-verified termination and confirmed by a fresh process table.
  Repeated and concurrent calls share one cleanup. Local test tooling for Windows; deadlines and clocks are injected (no wall clock in the hermetic tests).

  Background:
    Given a session from the bounded startup that carries `owned`, the recorded process tree (pid plus creation time)
    And a graceful close (default: the sealed session close), a bounded wait after the tree is gone, and guarded process adapters

  Scenario: A normal close leaves nothing and kills nothing
    Given the graceful close succeeds
    Then the outcome is clean, every owned process is already gone, no kill was requested and the scratch removal ran once

  Scenario Outline: A stuck graceful close is bounded and the owned tree is ended
    Given <stuck> never settles while the browser lives
    When the graceful deadline expires
    Then the owned tree is terminated by identity and confirmed by a fresh table
    And the sealed cleanup then settles, so the scratch removal was still attempted
    And a same-image look-alike outside the tree survives
    Examples:
      | stuck             |
      | context.close()   |
      | browser.close()   |

  Scenario: A failed scratch removal is reported, not hidden
    Given the graceful path succeeds or fails and the scratch removal then fails
    Then close() rejects with a CloseError that names the scratch failure and still reports the tree as gone

  Scenario: A sealed cleanup that never settles is reported as unconfirmed
    Given the tree is gone but the sealed close never settles within the bounded wait
    Then close() rejects with scratch unconfirmed after that bounded wait

  Scenario: Survivors and unconfirmed kills reject with a typed error that lists them
    Given a process that cannot be ended, an access denied kill or a kill adapter that lies
    Then close() rejects with a CloseError that lists survivors, failed and unconfirmed identities and is never clean
    And no kill was ever requested by image name or marker

  Scenario: A close after the browser died
    Given the browser exited before close() was called
    Then close() does not hang, reports the tree as already gone and still lets the scratch removal run

  Scenario: A second close and concurrent closes share the first outcome
    Given close() was called once or several times at the same moment
    Then every caller gets the very same promise and outcome, the graceful close and the termination ran once, and a rejection is shared too

  Scenario: Closing during an unfinished startup aborts it
    Given a startup that has not produced a session yet
    When close() is called
    Then the startup is aborted, its owned tree is ended and the lock is released, and the outcome says the startup was aborted

  Scenario: Hostile adapters and invalid options cannot hang or mislead the close
    Given list or kill adapters that never settle, a graceful seam that never settles, or invalid deadlines
    Then close() still rejects in bounded time, nothing is claimed gone, and invalid deadlines fail with ERR_INVALID_ARG

  Scenario: The U005 files are consumed read-only and pinned
    Given the imports.json of U006
    Then the raw, LF and git blob SHA-256 of every imported U005 file match the current bytes and the published commit and tag

  Scenario: A real headless Edge is closed normally and by a forced stuck close
    Given a real isolated headless Edge from the bounded startup and an independent read-only process table
    Then a normal close leaves zero owned survivors
    And a never-settling graceful close is ended by owned-tree termination while a same-image look-alike survives
