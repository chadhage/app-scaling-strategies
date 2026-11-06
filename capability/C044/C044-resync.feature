Feature: C044 fix after the independent review: an applied event is shown as applied at most once, whatever the recovery path
  Added after the reviewer rejected the first publication (finding F1, major). C044.feature is unchanged; this file specifies
  the corrected client behaviour. Training rehearsal - synthetic data - not a live Azure result. Loopback only.
  INVARIANT: an event id (run:epoch:sequence) is displayed as applied AT MOST ONCE per page session, across disconnect,
  rewound re-request, typed failure, Resync and reconnect. A later arrival of an id that was already applied is a counted,
  visible dropped duplicate. The watermark (epoch, last applied sequence) never moves backwards.

  Scenario: Resync after a typed failure keeps the watermark, so the replayed window is counted as duplicates
    Given a client that applied events 1 to 73 of epoch 3 and was refused a re-requested cursor with a typed CURSOR_EXPIRED
    When the user presses Resync from snapshot and the cursorless stream replays the retained window 39 to 78
    Then events 39 to 73 are dropped duplicates (35 counted and listed as dropped)
    And only events 74 to 78 are applied, so no id appears twice in the console
    And the marker says nothing was skipped and the applied counter is 78

  Scenario: A resync whose window starts after the watermark names the exact skipped range
    Given a client whose last applied event is 13 and a retained window that starts at 40
    When the first event delivered after Resync is 40
    Then a gap is recorded for sequences 14 to 39 and the marker names exactly that range
    And the event 40 and its successors are applied once

  Scenario: Only a new epoch resets the watermark, and the new epoch starts at its own beginning
    Given a client that applied events of epoch 3 and a server restarted under epoch 4
    When the user presses Resync from snapshot and epoch 4 starts at sequence 1
    Then the events of epoch 4 are applied once from sequence 1, the epoch change is recorded
    And a later delivery of an epoch 3 event is rejected as a foreign epoch, never applied again

  Scenario Outline: The recovery sequences never apply an id twice and the counts reconcile
    Given a seeded random sequence of <operations>
    When every operation is applied to the reducer
    Then after each operation no id was applied twice
    And delivered = applied + duplicates + out-of-order + rejected, and applied + skipped ranges cover the epoch contiguously
    Examples:
      | operations                                                                                   |
      | deliver a window, disconnect, rewound re-request, typed failure, Resync, restart with a new epoch |

  Scenario: A request that carries a body is answered once and the connection is closed
    Given a client that sends GET with an endless chunked body of one-byte chunks
    When the server answers 400 UNEXPECTED_BODY
    Then the answer carries Connection: close and the server destroys the socket after the response
    And no further body byte is parsed

  Scenario: Frames replayed after a restart are byte-identical to the frames sent before it
    Given a persisted run whose events were sent to a client and the process was killed
    When the restarted server replays the same events
    Then each id, event name and data string equals the original byte for byte
