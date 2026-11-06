Feature: Sequenced WebSocket fixture with acknowledgements and resume cursors
  C026 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 with an ephemeral port. It is not the approved Node 24
  Express control API, it validates no production runtime and registers no identity, and it calls no cloud service.
  The server speaks RFC 6455 through its own framing module (Node built-ins only) and OWNS every sequence number.

  Background:
    Given a loopback fixture whose synthetic stream has 12 messages and a window of 3 unacknowledged messages
    And the client may only say hello, resume, or acknowledge; it never names a sequence for a message

  Scenario: Messages arrive in strict server-owned order
    When a client says hello
    Then the server answers welcome with a session, a cursor for sequence 0, the total and the window
    And messages 1, 2 and 3 arrive in that order, each marked redelivered false with one delivery
    And no message beyond the window is sent before an acknowledgement

  Scenario: Acknowledgements advance the cursor one message at a time
    Given messages 1 to 3 were delivered
    When the client acknowledges 1
    Then the server answers acked 1 with the cursor for sequence 1 and sends message 4
    And acknowledging 2 and 3 in order completes the window without gaps or duplicates

  Scenario: A message that was never sent is never acknowledged
    Given only messages 1 to 3 were sent
    When the client acknowledges 6
    Then the server fails with ACK_UNSENT and closes with 1008
    And the recorded acknowledged position is unchanged

  Scenario Outline: A client cannot forge, skip or repeat a sequence
    When the client sends "<attempt>"
    Then the server fails with "<code>" and closes with 1008
    And the stream state is unchanged
    Examples:
      | attempt                                   | code                      |
      | a message frame carrying its own sequence | CLIENT_SEQUENCE_FORBIDDEN |
      | acknowledging 3 before 1 and 2            | ACK_OUT_OF_ORDER          |
      | acknowledging 1 a second time             | ACK_DUPLICATE             |
      | acknowledging a non integer sequence      | ACK_MALFORMED             |

  Scenario: An abrupt close followed by resume loses nothing and duplicates nothing
    Given messages 1 to 5 were sent, 1 and 2 were acknowledged, and the socket is destroyed without a close frame
    When the client resumes with the cursor for sequence 2
    Then the server answers resumed with acknowledged 2 and last sent 5
    And messages 3, 4 and 5 are redelivered exactly once, marked redelivered true with two deliveries
    And acknowledged messages 1 and 2 are never sent again
    And new messages continue after 5 only after acknowledgements make room in the window

  Scenario Outline: Unusable cursors are explicit typed failures
    When the client resumes session "<session>" with cursor "<cursor>"
    Then the server fails with "<code>" and closes with 1008
    And no session state changes
    Examples:
      | session               | cursor                      | code                   |
      | a session never made  | the cursor for that session | SESSION_UNKNOWN        |
      | the real session      | not a cursor                | CURSOR_MALFORMED       |
      | the real session      | a cursor of another session | CURSOR_FOREIGN_SESSION |
      | the real session      | a cursor past the last sent | CURSOR_FROM_FUTURE     |
      | the real session      | a cursor past the last ack  | CURSOR_AHEAD_OF_ACK    |

  Scenario: A cursor behind the server record continues after the server record
    Given the server recorded acknowledgement 3 and the client presents the cursor for sequence 1
    When the client resumes
    Then the server continues after 3 and never sends 1, 2 or 3 again

  Scenario: A completed stream completes again and sends nothing
    Given every message was acknowledged
    When the client resumes the session
    Then the server answers resumed and complete and closes with 1000 without sending any message

  Scenario: Parallel clients never see each other's messages
    When eight clients say hello at the same time and acknowledge everything
    Then each receives messages 1 to 12 once, in order, for its own session only

  Scenario Outline: Protocol and framing violations close with the RFC 6455 code
    When a client sends "<violation>"
    Then the server closes with the matching code and never treats the frame as a message
    Examples:
      | violation                  | close |
      | an unmasked frame          | 1002  |
      | a reserved bit             | 1002  |
      | a fragmented control frame | 1002  |
      | invalid UTF-8 text         | 1007  |
      | a binary frame             | 1003  |
      | an oversized frame         | 1009  |

  Scenario: The handshake accepts only a well formed local upgrade
    Then Sec-WebSocket-Accept is derived from the key as RFC 6455 specifies
    And a wrong version, a missing key, another Host, another Origin or another path is refused without an upgrade
    And pings are answered with pongs and a client close is echoed

  Scenario: Inspect a server-produced transcript in a real browser
    Given the isolated browser helper blocks WebSockets, writes and foreign origins
    When the page GETs the transcript the server produced from a real server-side WebSocket conversation
    Then the page shows hello, acknowledgements, the abrupt disconnect, the resume and the redelivered messages
    And the page verifies the transcript itself and shows typed failures for the forged probes
    And a missing or altered transcript is REJECTED, never shown as healthy
    And the README states that the browser observed the transcript, not a browser WebSocket

  Scenario: Respect the C001 operating envelope
    Then the CLI rechecks C001 local-probe consent and binds only 127.0.0.1 on an automatically assigned port
    And no Azure call, identity, spend, IaC, scaffold or deployment is performed or implied
    And Node built-ins on the observed test runtime are not presented as the approved Node 24 Express service
