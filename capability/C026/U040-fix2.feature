Feature: C026 requests dropped behind a refusal are bounded, and an answer that closes the connection marks it
  U040 fix 2 (addendum 2) answers the independent review of U040 (finding F1 and the minor m1). Fix 1 dropped every request pipelined
  behind a refusal or behind a pending transcript answer, but a dropped request writes nothing: Node pauses a pipelining connection only
  when the OUTPUT queued behind an unfinished answer reaches the write high-water mark, so it kept parsing and holding one request and
  one response object per pipelined request and a child with a 48 MB heap died at 3 sockets (exit 134).
  Training rehearsal - synthetic data - local loopback only - not a live Azure result

  Scenario Outline: A flood behind a marked connection cannot exhaust a small heap (the F24 probe, three variants)
    Given the fixture server in a SEPARATE node process with a 48 MB heap
    And <first> is the first request of each of 3 sockets
    When each socket then writes 50 blocks of 64 KB of pipelined GET /scope.json and reads nothing
    Then the server process is alive and every attacker socket is closed
    And a legitimate GET on a new connection is answered 200
    And the server announced the drop budget exactly once per attacker socket and read a bounded number of requests from it
    Examples:
      | first                                                          |
      | a real GET /transcript.json (answered after an await)            |
      | a refused GET /nope                                              |
      | a transcript that never settles (held)                           |

  Scenario: The drop budget is exact and per connection
    Given a refusal on a connection and a number of requests pipelined behind it in one write
    When 16 requests follow the refusal
    Then the refusal is delivered, the connection is closed after the flush and no limit event is announced
    When 17 requests follow the refusal
    Then the connection is destroyed at the 17th and the limit DROPPED_REQUEST_BACKLOG (limit 16) is announced exactly once
    And another connection of the same server still has its own full budget

  Scenario Outline: Seeded hostile pipelines around the budget keep every invariant
    Given a pipeline of reads, refusals, transcript reads and upgrades with 14 to 20 requests behind the first mark, in one or two writes
    Then no hub session exists unless a valid upgrade came before every mark
    And the answers the client got are a prefix of the answers the model expects, and the connection ends
    And a limit event was announced if and only if more than 16 requests were dropped

  Scenario: An answer that Node forces to close marks the connection (m1)
    Given GET /scope.json with Expect: 100-continue followed in the same write by a valid upgrade and a masked hello frame
    Then the answer says Connection: close, no 101 is sent, no hub session exists and the connection is closed
    And the same bytes without Expect upgrade normally

  Scenario: What is documented stays true
    Given earlier pipelined reads, a parse error, a refused upgrade or a read behind a successful transcript answer
    Then the documented limits m2 (a raw refusal of an upgrade takes the place of the later read answers), m3 (no typed 400 behind earlier reads) and m4 (a plain read behind a successful transcript answer is dropped, bounded by the drop budget) still describe the behaviour
