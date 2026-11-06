Feature: C043 third round (R3): requests that bypass or abort the HTTP handler (CONNECT, Upgrade, h2c, Expect after a refusal)
  Written before the tests and the change. Same scope as C043.feature: SYNTHETIC, LOCAL, OFFLINE, 127.0.0.1 with an ephemeral
  port, Node built-ins only. Self-review line 14 of the second attempt listed what was never probed: a CONNECT request and an
  Upgrade request. A probe against the second-round code found one real hole: without a 'connect' listener Node destroys the
  socket of a CONNECT request AT ONCE, so a valid mutation written in the same TCP write BEFORE the CONNECT is applied and its
  answer is lost with the connection (HTTP/1.1: no answer, the ledger moved by 15 units). That is the F1 class: an effect the
  client was never told about. A CONNECT request is never supported: it is answered through the ONE refusal path, AFTER the
  answers of the requests that came before it, and nothing behind it runs. An Upgrade header (also h2c) is ignored, as RFC 9110
  allows: Node emits no 'upgrade' event without a listener, so the request is an ordinary one and the closing mark of the
  connection applies to it like to any other request.

  Background:
    Given the preset service of C043 in this process, and the same service in a separate server process
    And two fictional leases of 100 and 10 units, and a valid preset of three steps of 5 units (15 units)

  Scenario Outline: A CONNECT request is a typed 405 that closes the connection, after the answers that came before it
    When the requests <layout> are written in ONE TCP write, in HTTP/1.1 framing and in HTTP/1.0 framing
    Then the client receives <answers>, the connection is closed by the server and the ledger and the revision are <state>
    Examples:
      | layout | answers | state |
      | [CONNECT] | the typed 405 METHOD_NOT_ALLOWED with an Allow header | unchanged |
      | [valid mutation][CONNECT] | the 201 of the mutation, then the 405 (HTTP/1.0: only the 201, its answer closes the connection) | moved by 15 units once |
      | [GET][CONNECT] | the 200, then the 405 | unchanged |
      | [CONNECT][valid mutation] | only the 405 | unchanged |
      | [refused][CONNECT][valid mutation] | only the refusal | unchanged |

  Scenario Outline: An Upgrade header is ignored and the closing mark of the connection applies to the request
    When <layout> is written in ONE TCP write, with Connection: Upgrade and Upgrade: websocket or h2c, in both framings
    Then <outcome>
    Examples:
      | layout | outcome |
      | [valid mutation with Upgrade] | it is an ordinary request: 201, applied once |
      | [refused][valid mutation with Upgrade] | the client receives only the refusal and nothing runs |
      | [GET with Upgrade] | it is an ordinary request: 200 |

  Scenario: Expect: 100-continue after a refusal
    When a refused request is followed by a valid mutation that carries Expect: 100-continue, in one write
    Then the client receives only the refusal (no 100 Continue) and the mutation does not run
