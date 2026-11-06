Feature: C043 addendum (rev-C017 F11, F12): requests that Node answers itself, and HTTP/1.0 framing
  Written before the tests and the change. Same scope as C043-review-fixes.feature: SYNTHETIC, LOCAL, OFFLINE, 127.0.0.1 with
  an ephemeral port, Node built-ins only. Node answers some requests ITSELF and never calls the request handler: an unknown
  Expect header (417), a request without Host (400), every parse error and every header overflow (clientError). Those answers
  must go through the ONE refusal path of the service: a typed answer, Connection: close, the socket marked and destroyed,
  nothing read afterwards, and nothing pipelined behind them may run. Node's maxRequestsPerSocket is never relied on: it is
  not applied to HTTP/1.0 requests, so the per-connection guard must not depend on the HTTP version.

  Background:
    Given the accepted C042 step service over a local journal and two fictional leases (100 and 10 units)
    And the preset service of C043 in a separate server process, and the same service in this process

  Scenario Outline: A Node-own answer is a typed refusal that closes the connection
    When a request that Node would answer itself is sent: <request>
    Then the answer is the typed envelope with status <status> and code <code>, Connection: close, and the server closes the socket
    And nothing pipelined behind it runs and the ledger and the revision of both journals are unchanged
    Examples:
      | request | status | code |
      | an unknown Expect header (with a chunked body that is dumped) | 417 | EXPECTATION_FAILED |
      | an HTTP/1.1 request without a Host header | 421 | LOCAL_HOST_REQUIRED |
      | a malformed request line, an invalid method, an invalid header line, Content-Length together with Transfer-Encoding | 400 | MALFORMED_REQUEST |
      | a header block beyond the size bound, more headers than the count bound | 431 | HEADERS_TOO_LARGE |
      | a request that did not arrive in time (clientError ERR_HTTP_REQUEST_TIMEOUT) | 408 | REQUEST_TIMEOUT |

  Scenario: Expect: 100-continue is honoured only for a request that was not refused
    When a valid POST with Expect: 100-continue is sent, and when a refused request with Expect: 100-continue is sent
    Then the valid one gets 100 Continue and then its answer, and the refused one gets its typed refusal without any 100 Continue

  Scenario: A parse error behind a request that is still being answered cuts nothing short
    When a valid mutation and a malformed request are written together and the mutation is still in flight
    Then the mutation is answered first, the typed refusal follows, and the connection is closed

  Scenario Outline: Every pair of the matrix is run in both HTTP framings in a separate server process
    When a refused request in framing <refused> is followed by a valid mutation in framing <mutation> in one write
    Then the client receives only the refusal, the connection is closed, and the ledger and the revision are unchanged
    Examples:
      | refused | mutation |
      | HTTP/1.1 | HTTP/1.0 |
      | HTTP/1.0 | HTTP/1.1 |
      | HTTP/1.0 | HTTP/1.0 |
