Feature: K-C020 repays the C020 server.cjs coverage debt with behavioral tests of the real loopback server and its CLI
  K-C020 / worker-K-C020 serves C020 [S]
  Zero credit; adds tests, one spec, one README and evidence only; no production source, sealed evidence, retained RED or existing test is edited
  Every test starts the REAL server on 127.0.0.1 port 0 (in process or as a CLI child process) and sends real requests; consent is read through an injected private ledger built from the sealed C001 approval, never from the live ledger

  Scenario: The accepted C020 tests leave refusal paths, consent failures and the CLI main block of server.cjs unmeasured
    Given the L-0004 coverage command over capability\C020\server.cjs with the accepted non-browser tests
    When it runs with the 85 percent line, branch and function thresholds
    Then it exits 1 with 84.21 percent lines, 74.36 percent branches and 66.67 percent functions
    And the uncovered lines are the body refusal, the 500 answer, both consent failures and the CLI listening, shutdown and failure callbacks

  Scenario: A GET that declares a body, an over-long target or a foreign, fragment or malformed target is refused with a precise code
    Given the real server listens on 127.0.0.1
    When raw requests declare a body by Content-Length or chunked framing, exceed 2048 characters, or carry a fragment, a foreign authority or a malformed target
    Then the answers are UNEXPECTED_BODY, URL_TOO_LONG and INVALID_URL with their exact messages, and a target of exactly 2048 characters still reaches routing
    And every refusal carries the exact JSON envelope and the local security headers

  Scenario: Queries, other methods, foreign hosts and foreign origins are refused in a fixed order
    Given the real server listens on 127.0.0.1
    When the scope record or an inspection asset is requested with a query, a method other than GET is used, or the Host or Origin is not the exact listener
    Then the answers are INVALID_QUERY, METHOD_NOT_ALLOWED, LOCAL_HOST_REQUIRED and CROSS_ORIGIN_DENIED
    And the guards run in the order host, origin, method, body, URL length, URL shape

  Scenario: Only the five allowlisted assets are served, byte-exact, and an unreadable asset never leaks its cause
    Given the real server listens on 127.0.0.1
    When every asset and every other entry of the namespace is requested, and one asset read fails
    Then each asset has its exact content type and bytes, and every other entry or traversal form is NOT_FOUND
    And the failing read is FIXTURE_UNAVAILABLE without the cause, other assets keep working and the same asset is served again after the fault

  Scenario: startLocal creates no server unless a valid current C001 approval is read, and then binds only 127.0.0.1
    Given an injected ledger that is unreadable, malformed, without approvals, hollow, drifted or unresolved
    When startLocal runs
    Then it rejects with the unavailable or denied reason and http.createServer is never called
    And with the sealed approval it listens only on 127.0.0.1 on an ephemeral port and serves the scope record, and a listen failure rejects with that error

  Scenario: The CLI prints one listening record, serves, shuts down on SIGINT and SIGTERM, and refuses to start without consent or with arguments
    Given the CLI runs as a real child process with a private ledger and a stdin stand-in for the signal
    When it starts, serves, receives the signal with an in-flight connection, or starts with a missing ledger, a drifted approval or an extra argument
    Then it prints exactly one record that equals the served scope record, drops the connection, stops listening and exits 0
    And a failed start prints the reason on stderr, prints no record and exits 1, and an extra argument is refused before consent is read

  Scenario: The new tests are sensitive to one-line defects of server.cjs
    Given a private copy of server.cjs
    When each of 44 one-line mutants is run against the new tests only
    Then every mutant fails at least one test
