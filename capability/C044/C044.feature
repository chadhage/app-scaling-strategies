Feature: C044 reconnect a live console stream without cancelling work
  C044 is one original S / P0 / LP-REPLAY unit under H004 and H008, gated by accepted C015, C019 and C036.
  Training rehearsal - synthetic data - not a live Azure result
  A loopback-only Node-builtin fixture serves one synthetic run as Server-Sent Events. Production Node 24,
  Express, Entra and any real service are neither validated nor registered; there is no cloud, identity or spend.

  Scenario: A reconnect with a correct cursor resumes at the next event
    Given a live console stream whose events have server-owned ids carrying run, epoch and sequence
    And a client that applied every event up to cursor N and then lost its connection
    When it reconnects with Last-Event-ID N or with the query cursor lastEventId N
    Then the first event it receives is N + 1
    And no event up to N is sent again and the delivered order is strictly increasing without gaps
    And the header wins over a stale query cursor because a browser re-sends its original URL on reconnect

  Scenario Outline: A disconnect never cancels, pauses or restarts the run
    Given the synthetic run is producing ordered events on its own schedule
    When a client is lost by <loss>
    Then the run's own counters keep advancing while no client is attached
    And no producer is cancelled, paused or restarted by the loss
    And a later reconnect from the last applied cursor receives the events produced during the gap exactly once
    Examples:
      | loss                                   |
      | an abrupt socket close in mid-event    |
      | a slow reader that never drains        |
      | a proxy-style idle drop                |

  Scenario Outline: A cursor that cannot be honoured is a typed failure with its allowed recovery action
    Given a replay window of bounded size and a current run and epoch
    When a client presents <cursor>
    Then the server answers an explicit typed failure and opens no stream
    And the failure names its group, a fixed reason and a closed list of allowed recovery actions
    And the stream is never silently empty and never silently restarted from the beginning
    Examples:
      | cursor                                  | code                  |
      | a cursor older than the replay window   | CURSOR_EXPIRED        |
      | a cursor beyond the head of the run     | CURSOR_FROM_FUTURE    |
      | a cursor attributed to another run      | CURSOR_RUN_MISMATCH   |
      | a cursor attributed to another epoch    | CURSOR_EPOCH_MISMATCH |
      | a malformed or non-canonical cursor     | CURSOR_MALFORMED      |

  Scenario: Duplicate handling holds on both sides of the wire
    Given the server never re-sends an acknowledged event on a correct cursor
    When a client deliberately re-requests an earlier cursor or two deliveries race
    Then the client reducer drops a duplicate or out-of-order delivery by id and counts it
    And the dropped delivery is shown as a dropped duplicate, never as a new event
    And a foreign or malformed delivery is rejected and counted, not applied

  Scenario: Parallel and repeated clients stay consistent
    Given several clients attached to one run with different cursors
    When one client reconnects twice with the same cursor and a reconnect storm follows
    Then every client sees exactly the events after its own cursor, in order, once
    And the attached-client count returns to zero and the producer never stops

  Scenario: A restarted server restores the run and its event log
    Given the run's versioned run and epoch state persisted in the C015 discipline
    When the server process is killed and started again on the same persisted directory
    Then the run, its epoch and its whole event log are restored and production continues at the next sequence
    And an acknowledged event never disappears
    And a corrupt log, a broken hash chain, a gap or a regressed epoch fails closed
    And a cursor from an earlier epoch is a typed failure, never an empty stream

  Scenario: The console page shows state, markers and drops
    Given a page served by the owned loopback listener with a strict content security policy
    When it connects with EventSource and the user disconnects and reconnects from the keyboard
    Then it shows the connection state, the events, a "reconnected from id N" marker and the dropped-duplicate counter
    And Disconnect and Reconnect only close and re-open the client connection while the server keeps producing

  Scenario: The listener is closed, consent-gated and read-only
    Given current C001 local consent is rechecked before any listener starts
    Then only 127.0.0.1 on an ephemeral port, GET requests and the closed own routes are served
    And foreign Host, foreign Origin, bodies, writes and unknown paths are denied
