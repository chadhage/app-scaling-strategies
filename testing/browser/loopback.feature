Feature: Explicit read-only loopback HTTP browser evidence
  The file-only API remains unchanged.
  A separate API may load an owned entry from a caller-owned synthetic listener.
  No remote server, shared browser, deployment, or cloud permission is implied.

  Scenario: Real same-origin responses in concurrent isolated sessions
    Given an existing entry file below an approved repository root
    And the caller supplies its live Node http.Server bound only to an ephemeral 127.0.0.1 port
    When two isolated headless sessions open that listener's root entry
    Then both documents remain visible and independently actionable
    And actual button and keyboard actions fetch scope and both profile versions over HTTP
    And response CSP sandboxing keeps the child document's origin opaque
    And closing either session releases only its own browser and scratch directory

  Scenario Outline: The origin is derived only from a caller-owned live HTTP listener
    When the loopback API receives "<handle>"
    Then it rejects the handle before launching any browser

    Examples:
      | handle                                    |
      | any URL string, including 127.0.0.1        |
      | an arbitrary object containing a URL      |
      | an unstarted or closed server             |
      | a listener bound to 0.0.0.0 or IPv6        |
      | a listener bound to another 127.x address |
      | a listener without an explicit valid port |

  Scenario: Existing path guards still apply
    Given a valid caller-owned live literal loopback server
    When the entry is a URL, missing file, out-of-root path, or escaping junction
    Then the loopback API rejects it before launching any browser
    And the original file-only API still rejects every URL

  Scenario: The loopback context cannot escape its read-only origin
    Given a real isolated loopback browser session
    When a page attempts a cross-origin fetch, redirect, non-read-only method, or WebSocket
    Then no disallowed request reaches either listener
    And HTTP responses are fetched without following redirects and forwarded unchanged
    And every HTTP redirect is rejected before the browser can follow it
    And service worker registration is blocked
    And browser security and response CSP are not bypassed
    And a closed or rebound server no longer authorizes requests
    And the helper never starts or closes the caller's server

  Scenario: An escaping entry redirect cleans up before rejecting
    Given the listener root redirects to another loopback port
    When the loopback API attempts to open the entry
    Then the navigation fails without contacting that other listener
    And the owned browser and scratch directory are cleaned up
