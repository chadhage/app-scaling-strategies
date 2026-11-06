Feature: Native gRPC stream fixture and driver port (real HTTP/2 protocol results)
  C028 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 with an ephemeral port. It is not the approved Node 24 Express
  control API, it validates no production runtime, registers no identity and calls no cloud service.
  The server speaks gRPC over cleartext HTTP/2 through node:http2 and its own protobuf and message framing (Node built-ins
  only, no grpc package, nothing installed). The fictional service acme.ticker.v1.Ticker has Watch (server streaming) and
  Chat (bidirectional). The SERVER owns every sequence number. The driver is a client on node:http2 that never reports
  success unless the real protocol evidence says so.

  Background:
    Given a loopback gRPC fixture and a driver that calls it over a real HTTP/2 socket

  Scenario: A server stream delivers ordered messages and ends with OK trailers
    When the driver watches topic "alpha" for 5 ticks
    Then the response is HTTP/2 status 200 with content-type application/grpc and no grpc-status in the headers
    And the five messages arrive in order with server-owned sequence numbers 1 to 5, each behind a 5-byte prefix
    And the final TRAILERS carry grpc-status 0 and the driver reports ok with origin server-trailers

  Scenario Outline: Immediate errors use the Trailers-Only form
    When a client sends "<request>"
    Then one HEADERS frame carries :status 200, grpc-status "<code>" and grpc-message and ends the stream
    And no DATA frame is sent and the driver reports ok false with that status
    Examples:
      | request                         | code |
      | an unknown method               | 12   |
      | a malformed protobuf message    | 3    |
      | an invalid field value          | 3    |
      | a malformed grpc-timeout        | 3    |
      | an oversized length prefix      | 8    |
      | a truncated message             | 3    |
      | a bad prefix flag               | 3    |
      | a call over the concurrency cap | 8    |
      | a call while draining           | 14   |

  Scenario: Anything that is not gRPC is refused and never answered as gRPC
    When a client sends a non-gRPC content type over HTTP/2
    Then the answer is HTTP status 415 without grpc-status
    When a client sends a plain HTTP/1.1 request to the gRPC port
    Then the answer is an HTTP/1.1 error status line and no gRPC trailers
    And a GET over HTTP/2 is refused with status 405

  Scenario: Deadlines expire as DEADLINE_EXCEEDED
    When a call carries grpc-timeout 100m and the stream never ends by itself
    Then the server stops producing and sends trailers with grpc-status 4
    And a driver deadline against a silent server reports DEADLINE_EXCEEDED from the client and resets the stream

  Scenario: A client cancel is observed by the server
    When the driver cancels a watch after 3 messages
    Then the server records CANCELLED, stops producing and never writes after the reset
    And the driver reports CANCELLED with origin client-cancel

  Scenario: A slow consumer applies backpressure
    When the client stops reading a large stream
    Then the server waits for drain instead of producing the whole stream
    And after reading resumes every message arrives once and in order

  Scenario: Parallel streams and concurrent clients do not mix
    When eight watches run on one session and eight clients watch at once
    Then every call receives its own messages 1 to N in order with its own topic

  Scenario: Bidirectional chat numbers the replies on the server
    When the driver sends notes and half-closes
    Then each echo carries a server sequence in order and the call ends with OK trailers

  Scenario Outline: The driver never reports success on a broken response
    When the server "<fault>"
    Then the driver reports ok false with violation "<violation>" and never ok true
    Examples:
      | fault                                   | violation                   |
      | ends the stream without trailers        | TRAILERS_MISSING            |
      | sends a truncated message               | TRUNCATED_MESSAGE           |
      | sends a prefix that promises too much   | TRUNCATED_MESSAGE           |
      | sends a prefix that promises too little | MESSAGE_MALFORMED           |
      | sends a bad prefix flag                 | BAD_PREFIX                  |
      | sends malformed protobuf                | MESSAGE_MALFORMED           |
      | answers HTTP 500 with JSON              | HTTP_STATUS                 |
      | answers with another content type       | CONTENT_TYPE                |
      | puts grpc-status in headers then data   | STATUS_IN_HEADERS_WITH_BODY |
      | resets the stream                       | STREAM_RESET                |
      | destroys the socket                     | TRANSPORT_CLOSED            |
      | sends a message over the size limit     | MESSAGE_TOO_LARGE           |

  Scenario: A non-OK status is reported honestly
    When the server ends with UNAVAILABLE after two messages
    Then the driver keeps the two messages in order but reports ok false, code 14 and the server message

  Scenario: Inspect a server-produced gRPC transcript in a real browser
    Given browsers cannot speak native gRPC and the isolated helper allows only same-origin GET
    When the page GETs the transcript the server produced from a real server-side gRPC conversation
    Then the page shows messages, order, status, trailers, a cancelled call and a deadline-exceeded call
    And the page verifies the transcript itself and a missing or altered transcript is REJECTED
    And the README states that the browser observed a transcript, not native gRPC

  Scenario: Respect the C001 operating envelope
    Then every CLI rechecks C001 local-probe consent and binds or connects only to 127.0.0.1
    And no Azure call, identity, spend, IaC, scaffold or deployment is performed or implied
    And Node built-ins on the observed test runtime are not presented as the approved Node 24 Express service
