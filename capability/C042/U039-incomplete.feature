Feature: A client error for a request that is still reading its body is answered and closed (U039 fix 4, finding F1 of the review of 146d8f0)
  C042 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 (Node built-ins only). The requests of one connection run strictly in order, and a refusal
  that Node decides itself (a parse error, a body cut by the request timeout, a client that half-closes in the middle of a body) is written after the
  answers of the requests BEFORE it. The committed fix made that refusal wait for the lane entry of the latest request. When Node reports the error
  for the request that is STILL RECEIVING ITS BODY, that entry is the request's own: its handler waits for a body that can never end, so the typed
  refusal waited for itself, nothing was written and the socket stayed open until the 90 s idle timeout; 128 sockets of 114 bytes pinned the connection
  cap. The accepted parent answered at once. Required: the request Node was still receiving is the one that failed (request.complete is false): it is
  never answered and never run, and the refusal waits only for the requests before it. A request whose message IS complete still waits for its own answer.

  Background:
    Given the C042 service over a memory journal, in this process or in a separate process
    And E is a complete legitimate read, and X is a POST /v1/steps whose message never completes

  Scenario Outline: A client error for the request that is still reading its body gets its typed answer and a closed connection
    When X breaks as <failure>, behind 0, 1 or 2 requests E in one TCP write, in HTTP/1.1 and HTTP/1.0 framing, also after Expect: 100-continue
    Then the client receives the answers of the earlier requests in order, then ONE typed refusal (400 INVALID_FORMAT, or 408 for a body that stops) with Connection: close
    And the SERVER ends the connection and its connection count returns to zero while the client still holds its socket
    And nothing was applied
    Examples:
      | failure |
      | a bad chunk size (zz) |
      | a Content-Length body of 10 of 100 bytes, then silence until the request timeout |
      | a Content-Length body of 10 of 100 bytes, then the client's FIN |
      | a missing CRLF after chunk data |
      | a chunk cut short, then the client's FIN |

  Scenario: A burst of 128 sockets of 114 bytes does not pin the connection cap
    When 128 sockets each send X with a bad chunk size
    Then every socket gets its typed 400 and is closed by the server, the server holds no connection and a legitimate GET is answered 200

  Scenario: Clients that leave in the middle of a body do not keep a slot
    When 8 clients send a partial body and then close their side
    Then the server closes every connection and holds none

  Scenario: An incomplete request queued behind a request in flight is dropped after its turn
    When a held submit is followed by X (a POST after Expect: 100-continue, or a GET with a broken chunked body) in one write
    Then the client receives the answer of the submit and ONE typed refusal, and the handler of X never ran (no 100 Continue, no answer of its own)

  Scenario: A request whose message is complete still waits for its own answer
    When a held submit with its whole body (Content-Length or chunked) is followed by garbage in one write
    Then the client receives the answer of the submit first and then the typed refusal

  Scenario: A hostile fuzz around the check never throws, hangs or answers twice
    When partial bodies, bad and huge chunk-size lines, NUL bytes, odd Transfer-Encoding values and prototype-like header names are sent behind 0 to 2 reads
    Then the earlier reads are answered first, at most one typed refusal follows, the connection is closed, nothing is applied and the process survives
