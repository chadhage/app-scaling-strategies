Feature: C042 residual verification without changing the accepted production
  Scenario: Upgrade-flagged incomplete bodies have an explicit, tested limit
    Given the service has no WebSocket upgrade listener
    When a chunked POST carries Connection Upgrade and Upgrade websocket then zz CRLF
    Then its typed INVALID_FORMAT 408 is delivered at the request timeout and the connection closes
    When a Content-Length 100 POST with those headers sends ten body bytes, pauses, then sends FIN
    Then the connection closes silently and no effect or connection slot remains
    And the README and U039 limits explicitly exclude these requests from the immediate typed-400 rule

  Scenario: Evidence verification is strict without an environment switch
    Given an addendum indexes a U039 evidence directory
    When an unpinned file is added there
    Then the plain evidence verifier names the unlisted addition
    And the documented external-anchor and pre-seal limitations remain explicit

  Scenario: Pending-socket cost is attributed to the retained review
    Then the README states the retained approximately two MB per 1310-request read
    And it states the 128-connection cap and the 48 MB child's twelve-survives, twenty-four-dies observation
    And it attributes the same observation on the accepted parent without claiming a fresh measurement

  Scenario: Evidence test cost is structural, not a clock assertion
    Then tamper tests share one verified 362-file accepted fixture
    And real file reads, digest operations and decompressions are counted before and after
    And the nested incomplete-body RED selects one deciding failure and the five unchanged controls

  Scenario: A dropped request releases its lane entry
    Given four handlers reached one connection and the first refusal closes
    When the response-close event releases the first lane
    Then all four handlers settle before the next event-loop barrier
    And deleting the dropped request's release is a named assertion kill, not a timeout

  Scenario: An append-only amendment preserves the accepted originals
    Then addendum four pins addendum three byte for byte
    And every supersession retains the exact previous bytes
    And all eight production files remain unchanged
    And the absent all-four-fixes generator is explicitly disclosed
