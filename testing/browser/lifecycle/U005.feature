Feature: Bound the browser startup so it can neither hang nor leave a browser behind
  The sealed helper (testing\browser\isolated.cjs) bounds only the launch and the first navigation (15000 ms each).
  newContext(), newPage() and the whole open have no deadline. U005 wraps openIsolatedLesson and openIsolatedLoopback
  in ONE injected deadline. On expiry only the process tree the open itself started is ended, by recorded identity
  (pid plus creation time), never by image name or marker, and the call rejects with a typed error.
  Local test tooling for Windows; deadlines, clocks and the process table are injected, so the hermetic tests use no wall clock.

  Background:
    Given a caller process, an injectable opener (default: the sealed helper) and injectable process-table adapters
    And the direct children of the caller are listed before the open, so the browser root is "a new direct child"
    And only one startup runs at a time in a process, so that difference is never ambiguous

  Scenario: A startup inside the deadline returns the session and the tree it owns
    Given the open resolves before the deadline
    Then the session keeps page, browserVersion and close, and carries the recorded owned tree
    And the root and every descendant are recorded as (pid, creation time) pairs and nothing is killed

  Scenario Outline: Expiry in any phase ends the owned tree and rejects with a typed error
    Given the open is stuck in the phase <phase> with a browser tree of that phase
    When the deadline expires
    Then the call rejects with a StartupError whose code is ERR_STARTUP_DEADLINE
    And the error carries the deadline, the phase, clean, and the identities terminated, already gone, refused, survived and failed
    And the whole browser tree is gone and clean is true
    Examples:
      | phase       |
      | launch      |
      | new context |
      | new page    |
      | navigation  |

  Scenario: Expiry before any child exists keeps watching until the open settles
    Given the deadline expires before the open spawned anything
    Then the call rejects at once with clean false and watching true
    And a browser that appears later is found by identity and ended
    And a session that resolves late is closed and its tree is gone
    And the final outcome is available as error.settled

  Scenario: A look-alike and the owner's browser survive
    Given a process of the same image and arguments that is not a new child of the caller
    And the owner's interactive browser
    When the deadline expires
    Then neither is ever sent a kill request

  Scenario: Survivors and failures are never success-shaped
    Given a browser process that cannot be ended
    When the deadline expires
    Then the rejection lists it as survived and clean is false

  Scenario: A kill is reported only after a confirming fresh table
    Given a kill adapter that claims a kill but leaves the process listed
    Then it is reported as survived, never as terminated

  Scenario: An adapter that never settles cannot hang the startup
    Given a list adapter or a kill adapter that never settles
    Then every call is raced against its deadline by the core and the rejection still arrives

  Scenario: An empty or truncated process table fails closed
    Given a process table without the caller's own pid
    Then nothing is reported gone and the call fails with ERR_TABLE_INCOMPLETE

  Scenario: An unreadable descendant is reported as unverifiable
    Given a descendant of the browser whose creation time cannot be read
    Then it is listed as unverifiable and is counted against clean while it is still listed

  Scenario: Foreign roots, system pids and the caller are refused
    Given a root that is not a child of the caller, pid 0 or 4, or the caller's own pid
    Then snapshotting fails, ownerPid is required, and no kill is ever forwarded for those pids

  Scenario: Pid reuse between snapshot and kill is refused
    Given a recorded pid that now belongs to a stranger
    Then it is refused as an identity mismatch and the stranger survives

  Scenario: Timers are capped and deadlines validated
    Given a deadline above 2147483647 ms, zero, negative or not a number
    Then the timer value is capped at 2147483647 and the others are rejected with ERR_INVALID_ARG

  Scenario: createWindowsAdapters gets an environment it can read
    Given process.env itself or a plain copy whose names differ in case
    Then the adapters are created for both shapes

  Scenario: Two concurrent startups are serialised and a call after a timeout works
    Given two callers open at the same time, or a caller opens after another timed out
    Then each recorded tree holds only its own browser and the second call succeeds

  Scenario: An abort signal ends the startup like an expiry
    Given an AbortSignal passed to the startup
    When it is aborted while the open is running
    Then the owned tree is ended exactly as on expiry and the call rejects with ERR_STARTUP_ABORTED
    And a signal that is already aborted launches nothing and reads no process table

  Scenario: An open that fails or cannot be proven owned leaves nothing behind
    Given an open that rejects inside the deadline, or resolves without any new child process of the caller
    Then leftovers are ended by identity and a clean failure rethrows the original error unchanged
    And a session without an owned root is closed and refused with ERR_STARTUP_UNOWNED, never returned
    And a process table that cannot be read before the open stops the startup before anything is launched

  Scenario: A real headless Edge is ended by a forced expiry
    Given a real isolated headless Edge and a test that owns the deadline
    When the test fires the deadline once the first owned child exists
    Then the launched tree is gone by an independent read-only table, and a foreign process of the same image survives

  # Fix after the independent review (rev-U005): ownership is positive and fixed at startup.

  Scenario: A session ends only the processes it owns, whatever the order of closing
    Given two live sessions opened one after the other, or two startups that ran concurrently
    When the first is ended, or ended twice, or the second is ended first
    Then only the ended session's tree is requested and ended, the other browser keeps running and answering
    And a direct child of the caller that appears after the startup is never adopted or ended
    And a second terminate of an ended session sends no kill request and never touches a browser opened in between

  Scenario: New roots are adopted only inside the startup window
    Given a startup that holds the per-process lock
    Then a new direct child of the caller is a new root only until the startup returned, failed or finished watching
    And afterwards observe() and terminate() refresh the descendants of the recorded identities only
    And a child the caller itself starts inside that window is still adopted (the honest limit)

  Scenario: An abort is honoured at every await
    Given an AbortSignal and a startup that is reading its baseline table or queued behind another startup
    When the signal is aborted
    Then the call rejects at once with ERR_STARTUP_ABORTED, the opener is never called, no virtual time had to pass
    And the lock chain survives and the listener is removed on every way out

  Scenario: The report is cumulative over distinct identities
    Given descendants that the core found and ended inside one sweep
    Then a later report still lists them once, and no identity is listed twice or in two lists

  Scenario: The budgets are one formula
    Given the defaults
    Then a sweep takes at most listMs + terminateMs + listMs, the default grace period covers it, and a table that never answers rejects at exactly the stated bound

  Scenario: The owner pid of the real adapters cannot be injected
    Given createOwnedAdapters without injected inner adapters
    Then the option selfPid is refused with ERR_INVALID_ARG and the owner is process.pid

  Scenario: Two real live sessions are closed in FIFO order
    Given two real isolated headless Edge sessions opened one after the other
    When the first is closed and ended twice
    Then the root of the second is alive, its page still answers and every kill request named the first tree only
