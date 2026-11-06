Feature: C059 second review fixes (third worker): every Node-own refusal goes through the lane, an answer cannot evade its binding with a null key, the checker has no new false positives
  The first fix (dfdace94) was rejected by rev-C059 on one major (N1) and three minors (N2 to N4); the information findings N5 and N6 are answered in the result.
  This specification is NEW; C059.feature, C059-review-fix.feature and every archived RED, GREEN and coverage run stay as they were.

  Scenario Outline: N1 a Node-own refusal behind legitimate pipelined requests answers them IN ORDER, then the typed refusal, then the connection closes
    Given a pipeline "<shape>" in ONE write: G is a legitimate GET, M a valid submit, R the refusal, L a valid submit behind it
    When R is "<refusal>" (an unknown Expect decided by Node at parse time, a refused 100-continue, a request without Host, a refusal of the service)
    Then the client receives the answers of the earlier requests in order and then the typed refusal with Connection: close
    And the server closes the connection, every M before R ran exactly once and L never ran
    Examples:
      | shape            | refusal                                  |
      | [G][G][R]        | Expect: nonsense (GET, and POST with a body) |
      | [G][G][G][R]     | Expect: nonsense                         |
      | [G][G][R][G]     | Expect: nonsense                         |
      | [M][G][R][L]     | Expect: nonsense                         |
      | [M][M][R][L]     | Expect: nonsense                         |

  Scenario: N1 the matrix holds in HTTP/1.1 and HTTP/1.0 framing, in the test process and in a SEPARATE server process
    Given every Node-own refusal behind one to three legitimate requests
    Then no later request runs, no answer comes after a refusal, no connection stays open and every refusal says Connection: close

  Scenario: N1 128 sockets that each send [G][G][Expect: nonsense] do not pin the connection cap
    Given a service in a separate process with a cap of 128 connections
    When 128 sockets each write [G][G][Expect: nonsense] and wait
    Then every socket is closed by the server, the server holds no connection, and a legitimate GET is answered
    And no duration is asserted: the sockets are counted

  Scenario: N2 a confirming answer must carry the key of the request and an echoed input
    Given a valid envelope of ANOTHER step with idempotencyKey, validatedInput and inputSha256 set to null
    Then the page refuses it as KEY_MISMATCH and never shows or adopts it, for a submit, an inspect and a retry
    And every combination of the three fields (real, null, deleted) on a succeeded, a replayed, an inspected and a cancelled answer is refused unless it is the genuine answer
    And a typed refusal without a key (415, 413, invalid JSON) is still shown

  Scenario: N3 the checker has no false positive for a decorative control exposed to nobody or for a nav tablist
    Given a button or a link with tabindex=-1 inside an aria-hidden subtree
    Then the checker reports nothing, and Tab never needs to reach it
    But a TABBABLE control inside aria-hidden is still ARIA_HIDDEN_FOCUSABLE, and a tabindex=-1 control outside aria-hidden is still CONTROL_NOT_REACHABLE
    And nav role=tablist and a heading role=menuitem are not ROLE_MISMATCH, while nav role=button still is

  Scenario: N4 the README states the limits it measured
    Then 100 Continue is sent when the lane starts a request, before the Host, Origin, URL, media-type and length checks
    And a pipeline of more than 4 waiting requests is cut at the documented depth bound
