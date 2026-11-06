Feature: An authenticated cookie-less client observes server-owned destination and state
  C032 is a LOCAL, SYNTHETIC, OFFLINE fixture: a loopback server on 127.0.0.1 port 0 and fictional controls.
  It is not the approved Node 24 / Express / Entra control API, and no real identity is verified.
  The client sends an explicit synthetic opaque credential in an Authorization header, never a cookie.
  The server owns every observation: which synthetic destination served the request and a per-client
  served-request counter (the state). A browser cookie, real or decoy, must never change either.

  Scenario Outline: An authenticated client observes a destination and a state counter chosen by the server
    Given the synthetic credential for client "<client>" on a fresh server
    When the cookie-less client observes <requests> times through real loopback HTTP
    Then the last observation names client "<client>", destination "<destination>" and state counter <requests>
    And the destination version and the destination response header agree with the body
    Examples:
      | client                 | requests | destination                 |
      | synthetic-client-alpha | 1        | synthetic-destination-blue  |
      | synthetic-client-alpha | 2        | synthetic-destination-blue  |
      | synthetic-client-alpha | 3        | synthetic-destination-green |
      | synthetic-client-beta  | 1        | synthetic-destination-blue  |

  Scenario: State is per client and survives the destination transition
    Given two synthetic credentials on one fresh server
    When the first client has been served three times and the second once
    Then the first client's counter is 3 on the new destination and the second client's counter is 1

  Scenario: Observations are identical with no cookie, a conflicting decoy cookie, and a cookie jar handed a Set-Cookie attempt
    Given the same sequence of authenticated requests, including the destination transition
    When it is run on three fresh servers with no Cookie header, with a conflicting decoy cookie,
      and with a cookie jar that a foreign loopback origin handed Set-Cookie attempts
    Then the server saw no Cookie header in the first run and the decoy cookies in the other two
    And all three sequences of destination and state observations are deeply equal
    And one interleaved run that alternates the three regimes request by request gives the same sequence

  Scenario: The server never emits Set-Cookie and never reads a cookie as identity or destination
    Given cookies that name a destination, an identity, an affinity or a session
    When success, failure, asset and scope responses are collected from the real server
    Then no response carries Set-Cookie or any other header outside the closed allowlist
    And a cookie jar that talked to the server afterwards still holds only the foreign cookies
    And a cookie that names an identity never replaces a missing credential

  Scenario Outline: A missing, malformed, forged or expired credential is an explicit typed failure
    When a request presents "<presentation>" and a decoy cookie that names client "synthetic-client-alpha"
    Then the response is HTTP <status> with error code "<code>" and a Bearer challenge
    And the body names no client, destination, state or stamp, so no default identity is invented
    And no served-request counter has been advanced
    Examples:
      | presentation                          | status | code                 |
      | no Authorization header               | 401    | CREDENTIAL_MISSING   |
      | an empty Bearer value                 | 401    | CREDENTIAL_MALFORMED |
      | the Basic scheme                      | 401    | CREDENTIAL_MALFORMED |
      | a well-formed but unissued credential | 401    | CREDENTIAL_FORGED    |
      | the expired credential                | 401    | CREDENTIAL_EXPIRED   |
      | two Authorization headers             | 400    | CREDENTIAL_AMBIGUOUS |

  Scenario: Expiry follows the server's logical epoch, never the wall clock
    Given a fresh server whose logical epoch is later than every credential's last epoch
    Then even the normally valid credentials fail with CREDENTIAL_EXPIRED

  Scenario: A caller cannot supply or override a destination, state or stamp
    When a caller sends a destination, state, stamp or identity as a query parameter, a body or a request header
    Then query parameters and bodies fail explicitly without an observation
    And request headers are ignored and never reflected into the response
    And the observation still comes only from the server's own routing and counters

  Scenario: Only the read-only observation, the scope record and the allowlisted assets exist
    Then other methods, unknown paths, foreign Host or Origin headers and oversized URLs fail explicitly
    And no response carries a cross-origin permission

  Scenario: The client never sends cookies and does not trust an incoherent or cookie-setting server
    When the client runs against a stub server whose headers disagree with its body, or that sets a cookie,
      or whose body is malformed or carries unknown fields
    Then the client reports a typed failure and returns no observation
    And every client request uses credentials omit, a Bearer header only and no Cookie header

  Scenario: The browser page shows the observation next to a decoy cookie
    Given the real page served by the loopback fixture in an isolated headless Edge
    When the conductor sets a conflicting decoy cookie and observes with the synthetic credential
    Then the destination and the counter come from the server and the decoy cookie value stays visible and unchanged
    And a missing, forged or expired credential shows an explicit failure and clears the previous observation
    And the page makes only credentials-omit GET requests to its own origin

  Scenario: Respect the C001 operating envelope
    Then the CLI rechecks current C001 local-probe consent and binds only 127.0.0.1 on an automatic port
    And a missing, unreadable, changed or denied consent cannot create a listener
    And the page and scope record say synthetic data, loopback only, no identity verification and no native qualification
    And IaC is N/A with no Dockerfile, Bicep, deployment, registration or spending
