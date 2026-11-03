Feature: C027 H005 local SSE replay from the last accepted event
  # Frozen S, one unit. C020 is the accepted technical entry gate.
  Background:
    Given current C001 consent permits only local implementation
    And the unchanged C020 synthetic profiles and version stamps
    And an owned HTTP listener bound only to literal 127.0.0.1 for at most 15 minutes

  Scenario: Real text/event-stream bytes arrive before the response ends
    When the client supplies an explicit accepted cursor START
    Then flushed UTF-8 SSE frames have stable stream, version, sequence and event IDs
    And multiple events arrive while that same HTTP response remains open
    And neither Content-Length nor Content-Encoding buffers the event stream

  Scenario: Receiving is not accepting
    Given native browser EventSource has received at least three events
    And the conductor has accepted only event one
    When the conductor closes EventSource and resumes from the accepted cursor
    Then a new native EventSource requests the suffix beginning with event two
    And received-but-unaccepted events are replayed in order
    And the accepted sequence is exactly one through six without repeated acceptance
    And browser automatic Last-Event-ID is never treated as application acceptance

  Scenario Outline: Fail closed without advancing acceptance
    When the fixture or client observes <fault>
    Then the outcome is <outcome>
    And the last accepted cursor is unchanged
    And the failed attempt remains inspectable
    Examples:
      | fault                         | outcome                                      |
      | an event sequence gap         | error EVENT_GAP                              |
      | a duplicate event             | error DUPLICATE_EVENT                        |
      | malformed event JSON          | error INVALID_JSON                           |
      | changed C020 data or lineage   | error EVENT_PAYLOAD_MISMATCH                  |
      | malformed cursor              | HTTP 400 INVALID_CURSOR                      |
      | cursor for another stream     | HTTP 409 CURSOR_STREAM_MISMATCH               |
      | a future cursor               | HTTP 416 FUTURE_CURSOR                       |
      | conflicting Last-Event-ID     | HTTP 409 CURSOR_CONFLICT                     |
      | a transport drop before tail  | unknown TRANSPORT_INTERRUPTED                |
      | native EventSource HTTP error | unknown; browser does not expose HTTP status |

  Scenario: A trusted file conductor uses the unchanged published browser helper
    Given the file page was generated from the exact owned listener handle
    And its CSP allows only that literal 127.0.0.1 SSE path
    And the server explicitly allows the null file origin without cookies
    When openIsolatedLesson opens the trusted conducting file
    Then native unmodified EventSource receives live events without route interception
    And keyboard connect, acceptance, disconnect, resume and reset work
    And forbidden same-listener paths and inline scripts are blocked by CSP

  Scenario: Bounded ownership and honest retained proof
    Then malformed consent and listener overrides cannot create a listener
    And errors and unknown observations cannot become success-shaped fallbacks
    And ordinary verification does not write retained proof
    And only deliberate CAPTURE_BROWSER_EVIDENCE=1 captures browser proof
    And original red and failed attempts remain immutable and are not auto-discovered tests
    And finally closes EventSource, browser, all owned connections, timers and the exact server
    And no cloud, durable storage, exactly-once, native Azure or Node 24 claim is made
