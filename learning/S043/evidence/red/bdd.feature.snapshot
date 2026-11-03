Feature: Resume one synthetic multipart upload across an ownership change
  A-S043 is one satisfier in SC-S043, parent D-S043.
  Training rehearsal - synthetic data - not a live Azure result
  No HTTP upload, real storage, Azure, credentials or native support is asserted.

  Background:
    Given a fixed synthetic upload of four ordered 12-byte ASCII parts
    And v1 has accepted parts 1 and 2 at original elapsed time 200 ms
    And the declared original completion budget is 1000 ms
    And ownership changes only after the operator pauses
    And the transfer consumes 100 synthetic ms and fences the old owner

  Scenario: Reconcile accepted parts and upload only missing parts
    When I start, pause and transfer ownership from v1 epoch 1 to v2 epoch 2
    And v2 can read the shared accepted-parts listing
    And I resume using reconciliation with intact bytes in 400 ms
    And I verify the assembled bytes using SHA-256
    Then accepted parts 1 and 2 survive without being uploaded again
    And exactly four parts and 48 bytes have been transmitted in total
    And final bytes and SHA-256 equal the original artifact
    And completion at original elapsed time 700 ms is within budget
    And the synthetic user outcome is success

  Scenario Outline: Correct final bytes alone do not prove uninterrupted resumption
    Given <condition>
    When I conduct and verify the upload
    Then the synthetic user outcome is failure
    And the trace and retained result expose <violation>

    Examples:
      | condition                              | violation                             |
      | accepted parts are instance-local      | two lost accepted parts and reuploads |
      | the resume policy restarts all parts   | two duplicate uploads                 |
      | candidate part 3 has one corrupted byte| final SHA-256 mismatch                |
      | continuation takes 701 ms              | original 1000 ms deadline exceeded     |

  Scenario: Deadline equality is inclusive and the original clock never resets
    When continuation takes 700 ms after the 300 ms pre-resume elapsed time
    Then completion at original elapsed time 1000 ms is within budget
    When continuation instead takes 701 ms
    Then completion at original elapsed time 1001 ms fails the same budget

  Scenario: Missing evidence is unknown, not a successful upload
    Given the candidate accepted-parts listing is unavailable
    When I start, pause, transfer and attempt resume
    Then no speculative candidate part is uploaded
    And the outcome is unknown with no observed final bytes or hash
    And the started run remains in retained history

  Scenario: Unknown evidence cannot hide a known failure
    Given the accepted-parts listing is unavailable
    And the transfer is known to have lost the instance-local accepted parts
    When I attempt resume
    Then the outcome is failure and the missing evidence remains explicit
    Given an original completion budget of 100 ms
    When I attempt resume at original elapsed time 300 ms
    Then a known deadline breach remains failure even without a listing

  Scenario: An old writer cannot mutate the accepted-parts ledger
    When I transfer ownership to v2 epoch 2
    And I use the stale v1 writer probe
    Then epoch 1 is rejected with no accepted part, byte or upload effect
    And the rejection is visible in the bounded trace
    And the valid candidate can still complete successfully

  Scenario: Input and state guards are strict and non-destructive
    When I supply a fractional, blank, out-of-range or non-numeric duration
    Or I supply an unknown option, extra field or unknown action
    Or I transfer before pausing or verify before resuming
    Then an accessible focused error explains the rejection
    And the upload state, counters and retained results do not change
    And active configuration cannot be changed during an upload

  Scenario: Reset cannot erase started or failed journeys
    Given an active upload or a terminal failure
    When I reset
    Then the exact default controls and idle state return
    And an unfinished started upload is recorded as unknown or known failure
    And all prior outcomes, configurations and traces remain in memory
    And keyboard focus returns to the first configuration control
    And reset does not replenish the twelve-run or ninety-six-action limits

  Scenario: A real browser operates the portable lesson safely
    Then the exact training banner, objective, bounds and native-proof limits are visible
    And Tab, Shift+Tab, arrow keys, Enter and Space operate the lesson
    And live status, guard errors, metrics and history are readable in the actual DOM
    And CSP blocks inline scripts, inline event handlers and network connections
    And there are no management calls, storage writes or unhandled page errors
    And verification is read-only unless deliberate browser evidence capture is enabled
