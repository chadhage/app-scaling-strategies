Feature: C017 Reconcile cancellation during an in-flight action and never fabricate an undo
  H004 H010 H012, class D. LOCAL, SYNTHETIC, OFFLINE. A fictional lease runs ONE action, "stage synthetic capacity", in ordered
  steps of synthetic integer units. Every effect is an entry of an append-only, hash-chained journal. The server owns the truth:
  every cancel answer is derived from the journal and is exactly one of CANCELLED_BEFORE_EFFECT, CANCELLED_PARTIAL,
  CANCEL_TOO_LATE, COMPENSATED or CANCEL_UNKNOWN. Nothing here is Azure, a real service, real data or spend.

  Background:
    Given the fictional lease "lease-synthetic-001", run "synthetic-run-001", user "user-synthetic-001"
    And an action of 4 ordered steps of 5 synthetic units each, started at epoch 1 with a client key

  Scenario: Cancel before any step ran
    When the action is cancelled before step 1 begins
    Then the outcome is CANCELLED_BEFORE_EFFECT and no effect stands and no step has an effect entry
    And the answer says there was nothing to undo

  Scenario: Cancel after steps 1 and 2 took effect leaves them standing
    When the action is cancelled while it waits before step 3
    Then the outcome is CANCELLED_PARTIAL listing steps 1 and 2 as standing (10 units) and steps 3 and 4 as not run
    And the answer says plainly that nothing was undone and the journal holds no compensating entry

  Scenario: Cancel during an in-flight step is applied at the step boundary
    When the action is cancelled while step 3 is between its intent and its effect
    Then step 3 finishes and stands and the outcome is CANCELLED_PARTIAL with steps 1 to 3 standing
    And the in-flight step is never reported as cancelled or as not run

  Scenario: Cancel after completion is too late and is not a success
    When the action has completed and a cancel arrives
    Then the outcome is CANCEL_TOO_LATE, the answer status is a conflict, all 4 effects stand (20 units)
    And the answer says the cancel was not effective

  Scenario: Cancel with compensation is COMPENSATED only when real compensating steps ran
    When the action is cancelled after step 2 with compensation requested
    Then compensating steps 2 and 1 run in reverse order as their own journal entries with their own effects
    And the outcome is COMPENSATED with 0 units standing and the original effects remain in the journal

  Scenario: A failed compensation is reported as such
    When compensating step 1 fails after compensating step 2
    Then the outcome is CANCELLED_PARTIAL, step 1 still stands, step 2 is listed as reversed and the failure is named
    And the outcome is never COMPENSATED

  Scenario: Cancel is idempotent per key
    When the same cancel (same key, same command) is sent twice, also after a restart
    Then both answers are identical and the journal holds exactly one decision
    And the same key with a different command is an IDEMPOTENCY_CONFLICT that changes nothing

  Scenario: Only one cancel is decided per action
    When a second cancel with a new key arrives while one is pending or after one was decided
    Then it is a typed CANCEL_IN_PROGRESS or ALREADY_TERMINAL failure that claims no outcome

  Scenario: Wrong identity, stale epoch and future epoch are typed failures with allowed recovery actions
    When a cancel names another lease, run, user, action, a stale epoch or a future epoch
    Then each is a typed failure with a closed code, allowed recovery actions and no outcome and no journal write

  Scenario: A cancel racing the final step yields exactly one consistent outcome
    When parallel clients cancel while step 4 is in flight and while step 3 waits
    Then exactly one cancel decision is journaled and every answer equals the outcome derived from the journal

  Scenario: Forged or hostile request content is rejected before any effect
    When a request carries an outcome field, extra keys, duplicate keys, __proto__, fractions, a wrong media type or a huge body
    Then it is a typed input failure, the journal is unchanged and no prototype is polluted

  Scenario: After a real process kill the persisted journal tells the truth
    When the server process is killed mid-action and restarted over the same journal
    Then the action is INTERRUPTED (never cancelled, never completed), journaled effects stand and an intent without an effect is UNKNOWN
    And a cancel that raced the crash, replayed with its key, answers CANCEL_UNKNOWN
    And reconciliation is an explicit command that settles the facts without claiming cancelled or completed

  Scenario: An unreadable or tampered journal is UNKNOWN, never repaired
    When a digest, a torn tail, an unknown field or a forged decision entry is found
    Then every view is UNKNOWN, a cancel answers CANCEL_UNKNOWN and the file is not written

  Scenario: The page can never overstate what happened
    When the page shows the steps, the journal, a keyboard-operable Cancel control and the reconciled outcome
    Then the wording is derived from the journal facts, a blocked or failed cancel request shows "not delivered, unknown"
    And "undone", "reversed" and "rolled back" appear only for COMPENSATED proven by the journal

  Scenario: Local scope and pinned imports
    When the CLI starts it rechecks C001 consent and binds only 127.0.0.1 on port 0
    Then reused accepted C001, C002 and C015 files are pinned by commit, tag and SHA-256 in imports.json
