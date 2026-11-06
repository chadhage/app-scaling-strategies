Feature: C026 nothing pipelined behind a refused request may upgrade, create a hub session or run
  U040 is a zero-credit defect fix on the accepted, sealed class S card C026. The HTTP routes are GET-only, but Node parses every
  request pipelined in one TCP read and emits each of them (an upgrade included) before the first response has finished. A refusal
  decided on a connection therefore has to stop everything behind it on that connection, however Node delivers it.
  Training rehearsal - synthetic data - local loopback only - not a live Azure result

  Scenario Outline: A valid upgrade and a masked hello frame behind a refused request create no session
    Given a fixture on 127.0.0.1 and a refused request <refusal>
    When one TCP write carries the refused request, then a valid Upgrade GET /stream and a masked {"type":"hello"} frame
    Then the hub session count is unchanged and no 101 is ever sent
    And the client receives exactly the refusal and the server closes the connection
    Examples:
      | refusal                                                              |
      | 404 GET /nope, 405 POST, 421 foreign Host, 403 foreign Origin         |
      | 426 plain GET /stream, 400 query, 400 body, 400 chunked body, 400 URL |
      | 417 unknown Expect, no Host, Expect: 100-continue, 500 transcript     |

  Scenario Outline: The same holds behind an answered request, in two writes, in both HTTP framings, in a separate process
    Given a refusal decided as the second request of a pipeline, or answered before the upgrade is written
    When the refused request is framed HTTP/1.1 or HTTP/1.0 with keep-alive and the upgrade is framed HTTP/1.1 or HTTP/1.0
    Then no session is created, the client receives the earlier answers and the refusal, and the connection is closed
    And the fixture in a SEPARATE node process behaves the same

  Scenario: A request behind a refusal does not run
    Given a refused request followed by GET /transcript.json on the same connection
    Then the transcript producer is never called and the client receives only the refusal

  Scenario Outline: Node answers some requests itself, and those answers are refusals too
    Given a request that Node would answer without calling the request handler: <case>
    Then the answer is the typed JSON refusal with Connection: close, and the connection is closed
    And a valid upgrade pipelined behind it creates no session
    Examples:
      | case                                                                   |
      | an unknown Expect header (typed 417 EXPECTATION_FAILED)                 |
      | Expect: 100-continue on a refused request (no 100 Continue is sent)     |
      | a request without Host (typed 421 LOCAL_HOST_REQUIRED, either framing)  |
      | bytes Node cannot parse (typed 400 MALFORMED_REQUEST, 408 and 431 too)  |

  Scenario Outline: Legitimate reads before a Node-own refusal are answered in order, then the typed refusal, then the close
    Given one to three valid reads pipelined BEFORE <case> in one write, in either HTTP framing where it applies, and optionally a read or an upgrade after it
    Then the client receives the earlier answers in order, then the typed refusal with Connection: close, and the connection is closed
    And nothing behind the refusal is answered or run and no session is created
    And the fixture in a SEPARATE node process behaves the same
    Examples:
      | case                                                                                              |
      | an unknown Expect header, on a GET and on a POST with a body (typed 417 EXPECTATION_FAILED)       |
      | Expect: 100-continue on a refused path (typed 404, no 100 Continue)                               |
      | a request without Host (typed 421 LOCAL_HOST_REQUIRED, either framing)                            |
      | bytes Node cannot parse (typed 400 only when nothing came before it; behind earlier reads the connection is closed, never upgraded, never answered beyond the expected answers) |

  Scenario: A burst of such connections does not pin the connection cap
    Given as many sockets as the connection cap, each sending two valid reads and a Node-own refusal in one write
    Then the server ends every one of those sockets, counted without a clock
    And a legitimate read is answered afterwards

  Scenario: A route that answers after an await closes its connection, so nothing can be ordered behind it
    Given the transcript route, whose answer is produced asynchronously
    When a valid upgrade is pipelined behind it while the answer is pending, and the answer fails or succeeds
    Then the answer says Connection: close, no session is created and the connection is closed

  Scenario: Legitimate use is unchanged
    Given no refusal on the connection
    Then a valid upgrade alone is accepted (101, welcome, one session) and stays open
    And a valid GET followed by a valid upgrade in one write is accepted

  Scenario: The sealed card stays verifiable
    Given the replaced bytes of server.cjs, tests\evidence-final.test.cjs, tests\coverage-gate.cjs and README.md
    When evidence-index-addendum-1.json supersedes exactly those bytes and nothing else
    Then evidence.json and every archived run of the first and fix publications stay byte-identical
    And tampering with the addendum, an archived run or a superseded copy is detected by a named test
