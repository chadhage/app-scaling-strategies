Feature: C043 third round (R3): no absolute time decides a resource test
  Written before the tests and the change. Same scope as C043.feature: SYNTHETIC, LOCAL, OFFLINE, 127.0.0.1 with an ephemeral
  port, Node built-ins only. The second-round coverage command of server.cjs failed twice on a machine at 100 percent CPU
  ('the flood ended within 16475 ms'): the refusal-flood test and four timer tests asserted wall-clock bounds (flood 12 s,
  event-loop lag 4 s, concurrent GET 6 s, keep-alive close 3 s, cut-off 6 s). The OS scheduler of a loaded machine dominates
  those numbers, so they measure the machine, not the server. A test decides on STRUCTURE: closed sockets, answered probes,
  a heap that is collected once the connections are gone, and the configured timers. A wall-clock limit is only a hang
  detector, never a measurement.

  Background:
    Given the preset service of C043 running in a child process with a small heap, and hostile clients in their own process

  Scenario: A correct server that the scheduler did not run for seconds still passes every resource test
    Given the server child is stalled once for 5 seconds, at its first accepted connection, by a busy wait
    When the refusal flood and the other resource tests run
    Then every test passes, and the lag the child measured proves that the stall took effect
    And the first version of the resource tests, run the same way, fails on a wall-clock bound

  Scenario: The documented timers and bounds are structure, read from the server itself
    When the local server is created with default bounds and with relaxed bounds
    Then requestTimeout, headersTimeout, keepAliveTimeout, timeout, connectionsCheckingInterval, maxConnections, maxHeadersCount and maxHeaderSize equal the documented values
    And removing any one of those assignments fails a named test without any waiting
