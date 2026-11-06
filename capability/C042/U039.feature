Feature: Close every refusal and never run a request pipelined behind it (U039, a defect fix after acceptance)
  C042 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 (Node built-ins only). The accepted server closed the connection only
  after a refusal whose body it had not read, and only on the 'finish' event, after the handlers of the requests pipelined
  behind it had run. Node parses every pipelined request of one TCP read and emits each request event before the first answer
  has finished, so a valid mutation behind a refusal APPLIED while the client saw only the refusal (U038 audit: 27 of 28
  refusal variants applied, 2 hidden). This feature states the required behavior; capability/C042/U039.md has the evidence.

  Background:
    Given the C042 service over a memory journal, in this process or in a separate process
    And a valid mutation M (POST /v1/steps, reserve 3 units), a valid read G (GET /v1/leases) and a refused request R

  Scenario Outline: A request pipelined behind a refusal never runs
    When R is <refusal> and M is written behind it, in one TCP write, in two writes 5 ms apart, behind G, chunked or with Expect
    Then the client receives only the answers of the earlier requests and the typed refusal with Connection: close
    And the SERVER ends the connection and the ledger, the revision and the journal hash are unchanged
    And the same holds when M is written in HTTP/1.0 framing and when R is written in HTTP/1.0 framing
    Examples:
      | refusal |
      | 404, 405, 421, 403, 414, 400 (key, query, URL), 404 (step, transcript), 422 |
      | 415, 413 (declared), 400 (a body on a GET), 405 (a body on a PUT) |
      | 400 (invalid JSON, unknown field, missing field), 413 (chunked), 409 (key conflict, no free capacity), 503 (step bound), 500 (transcript) |
      | the answers Node gives itself: an unknown Expect header, a request without Host, CONNECT, a parse error, an oversized header |

  Scenario: A mutation that came first is applied and answered, then the refusal
    When M is written, then R, in one TCP write
    Then the client receives the answer of M and then the typed refusal
    And the state equals the state after M alone

  Scenario: A refusal decided after an await also drops what was queued behind it
    When R is decided only after its body was read (invalid JSON, a conflicting key, a full lease)
    Then the request queued behind it never starts, because the requests of one connection run strictly in order

  Scenario: Pipelines of successful requests are still served, in order, on one kept-alive connection
    When G, M, G, G are written in one TCP write
    Then four answers arrive in order, every one with Connection: keep-alive, and the connection stays open
    And a request pipelined behind a slow request waits for its answer and then sees its effect
    And at most 4 requests may be pipelined, the fifth destroys the connection (unchanged)

  Scenario: Node-own answers keep their order and their meaning
    Given a parse error behind a request that is still in flight
    Then the answer of that request is sent first, then the typed refusal, then the connection closes
    And the server stops reading the connection and closes its side although the client keeps its side open
    And Expect: 100-continue is answered only for a request that will be read

  Scenario Outline: A refusal that Node decides itself answers the requests pipelined BEFORE it first (the third hole)
    Given <earlier> legitimate requests pipelined before the refusal and <after> behind it, in ONE TCP write
    When the refusal is an unknown Expect header (with and without a body), a request without Host, a parse error or CONNECT
    Then the client receives the answers of the earlier requests IN ORDER, then the typed refusal with Connection: close, and nothing after it
    And the SERVER ends the connection and only a mutation that came BEFORE the refusal is applied
    And the same holds with HTTP/1.1 framing, with the legitimate requests in HTTP/1.0 framing and with everything in HTTP/1.0, in this process and in a separate server process
    Examples:
      | earlier | after |
      | a read | no request |
      | two reads | no request |
      | three reads | no request |
      | two reads | a read |
      | a mutation and a read | no request |

  Scenario: 128 sockets that each send two reads and an unknown Expect do not pin the connection cap
    When 128 sockets each write two reads and a request with Expect: nonsense in one TCP write
    Then every socket reads both answers and the typed 417, the server closes every socket, no connection is left and a legitimate GET is answered

  Scenario: A client that left is not served
    Given M and a second request in one TCP write and the client disconnects while M is in flight
    Then M completes (its effect is journaled) and the second request never runs

  Scenario: A refusal flood from another process
    When 25 sockets each send a refusal (bodiless, endless chunked body, invalid JSON) and then one valid request on the same connection
    Then every refused connection is closed by the server, no follow-up request is answered and no connection is left
    And the accepted bytes, used as a control under the same load, keep the connections open

  Scenario: The limits of this proof are stated
    Then HTTP/1.0 framing, Connection: keep-alive negotiation and an h2c upgrade header are probed on loopback only
    And HTTP/2 prior knowledge, TLS and a front proxy are not (the fixture is HTTP/1.1 on 127.0.0.1)
