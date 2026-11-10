Feature: Server-side visitor, conductor and operator mutation permissions
  C009 is a local, synthetic H003 fixture, not the approved Node 24 Express control API and not a real identity service.
  Fake in-memory identities (visitor, conductor-a, conductor-b, operator) present opaque bearer tokens to a loopback HTTP server.
  Every decision is made on the server from the verified token. Nothing a client claims can raise or lower a role.
  All data is synthetic. No Entra, cloud, registration or spend is involved; roles do not inherit from each other.
  Mutations are POST commands only. Reads and the authorization preview are GET. A presented credential is always verified,
  never silently downgraded to anonymous. The permission table is deny by default and is consulted before any input is read.
  The shared browser helper permits only GET and HEAD, so the real-browser observation shows server decisions through GET
  and reports a blocked POST as "not sent"; real POST outcomes are proven over real loopback sockets in Node.

  Scenario Outline: Each valid identity succeeds only with its own mutating commands
    Given the synthetic identity "<identity>" holds a valid bearer token
    When it sends "<command>" with valid input to the real loopback server
    Then the answer is HTTP <status> with outcome "<outcome>"
    Examples:
      | identity    | command            | status | outcome        |
      | conductor-a | run.create         | 200    | ok             |
      | conductor-b | scratch.create     | 200    | ok             |
      | operator    | pool.resize        | 200    | ok             |
      | operator    | experiment.approve | 200    | ok             |
      | visitor     | run.create         | 403    | ROLE_FORBIDDEN |
      | visitor     | scratch.create     | 403    | ROLE_FORBIDDEN |
      | visitor     | pool.resize        | 403    | ROLE_FORBIDDEN |
      | visitor     | experiment.approve | 403    | ROLE_FORBIDDEN |
      | conductor-a | pool.resize        | 403    | ROLE_FORBIDDEN |
      | conductor-b | experiment.approve | 403    | ROLE_FORBIDDEN |
      | operator    | run.create         | 403    | ROLE_FORBIDDEN |
      | operator    | scratch.create     | 403    | ROLE_FORBIDDEN |

  Scenario: A forbidden command fails with a typed error and has no effect
    Given the full server state and revision are recorded
    When a visitor, a conductor and the operator each send a command their role does not hold
    Then every answer is HTTP 403 with code "ROLE_FORBIDDEN" naming the server-derived role and the required roles
    And the state snapshot, revision and every query result are unchanged
    And the denial is recorded with the server-derived subject and role

  Scenario: Allowed commands stamp ownership from the verified token only
    When a conductor creates a run
    Then the stored owner is the token's subject
    And a body field claiming another owner, role or subject is rejected with HTTP 400 and no effect

  Scenario Outline: Missing, malformed, forged or expired tokens never degrade to a visitor with write access
    Given a request to a protected route carries <credential>
    When it sends a mutating command that a conductor may send
    Then the answer is HTTP 401 with code "<code>" and a Bearer challenge
    And the WWW-Authenticate header carries the Bearer scheme
    And nothing changes and the answer is never HTTP 200 or 403

    Examples:
      | credential                                  | code                    |
      | no Authorization header                    | AUTHENTICATION_REQUIRED |
      | a Basic scheme                             | TOKEN_MALFORMED         |
      | an empty bearer token                      | TOKEN_MALFORMED         |
      | a token of the wrong shape                 | TOKEN_MALFORMED         |
      | two Authorization headers                  | TOKEN_MALFORMED         |
      | a well-formed token this server never made | TOKEN_UNKNOWN           |
      | a token issued here whose lifetime ended   | TOKEN_EXPIRED           |

  Scenario Outline: A client-claimed role, subject or owner is ignored
    Given a visitor token and the claim "<claim>"
    When the visitor sends a command only an operator may send
    Then the answer is HTTP 403 and the recorded role is "visitor"
    And a claim header is reported as ignored by name and never reflected by value
    And the same claim cannot lower an operator's real permissions or raise a conductor's

    Examples:
      | claim                                  |
      | X-Role: operator                       |
      | X-User-Role: operator                  |
      | X-Roles: operator,conductor            |
      | Role: operator                         |
      | X-Forwarded-Role: operator             |
      | X-MS-CLIENT-PRINCIPAL-NAME: operator   |
      | query string role=operator             |

  Scenario Outline: Arbitrary, unknown or malformed commands are rejected without effect
    Given the operator, who holds the most privileges, is authenticated
    When it sends "<request>"
    Then the answer is an explicit typed error and nothing changes

    Examples:
      | request                                       |
      | an unknown command such as native.execute     |
      | an inherited name such as constructor         |
      | a traversal name such as ../admin             |
      | input with an unknown field                   |
      | input of the wrong type or outside its bounds |
      | invalid JSON or a body that is not an object  |
      | a body above the size limit                   |
      | a media type other than application/json      |

  Scenario: Forbidden is decided before any input is read
    Given a visitor sends an operator command with invalid JSON, an oversized body or an unsupported media type
    Then the answer is HTTP 403 "ROLE_FORBIDDEN", not a validation error, so a forbidden identity learns nothing about input rules

  Scenario: Mutation commands are POST only and reads never mutate
    When a GET, PUT, PATCH or DELETE targets a command route, or a POST targets a read route
    Then the answer is HTTP 405 with an Allow header and nothing changes

  Scenario: A command without a permission entry is denied for every role
    Given a handler is registered but the permission table has no entry for it, or an entry with no roles
    When every identity sends it
    Then no entry is HTTP 404 "COMMAND_UNKNOWN" and an empty role list is HTTP 403 "ROLE_FORBIDDEN" with no required roles
    And the handler never runs

  Scenario: Authorization is enforced again where the effect is committed
    Given a conductor token that is valid when its command arrives but expires while an earlier command is still running
    When the earlier command finishes
    Then the queued command fails with HTTP 401 "TOKEN_EXPIRED" and has no effect

  Scenario: Public reads need no token but a presented bad token is never ignored
    Then the state and scope reads succeed without credentials
    And the same reads with a forged or expired token fail with HTTP 401 and the typed code

  Scenario: The authorization preview is the same decision the server enforces
    When each identity previews each command and then actually sends it with valid input
    Then the preview "allowed" flag equals actual success and its code equals the actual outcome
    And a preview never changes state or the revision

  Scenario: Commands are linearized
    Given two commands whose handlers yield to the event loop
    When both arrive together
    Then their effects never interleave and arrive in arrival order
    And a handler failure does not stall later commands

  Scenario: Requests are bound to the loopback origin
    Then a forged Host header, a foreign Origin, a method outside the route, and a body on a read are refused explicitly
    And responses are never cached and carry a strict content security policy

  Scenario: Request targets are exact
    Then a fragment, an absolute-form target to another host, a protocol-relative target, a trailing slash, a matrix parameter,
    a lowercase method and an unknown method never reach a command, and dot segments or an absolute same-origin target are
    decided by the same permission check as the plain route

  Scenario: A hostile client cannot grow server memory, hold sockets or block shutdown
    Given the server runs in a child process with a 48 MB heap under a hard external timeout
    When clients flood pipelined requests and never read, hold silent, partial or half-open sockets, send a header flood
    or an endless chunked upload
    Then the retained heap stays small, a normal client and a normal authorized command are still served, and nothing changed
    And a client that pipelines more than 4 requests in flight is cut off, connections beyond 256 are dropped,
    and a socket that stays silent for 5 seconds is dropped
    And closing the server ends every accepted socket and the process exits by itself with code 0

  Scenario: State growth by authorized clients is bounded
    Given a conductor and the operator hold valid tokens
    When commands keep adding runs, scratches or approvals beyond the entry limit
    Then the command fails with HTTP 409 "STATE_FULL" and has no effect, and commands that add no entry still work

  Scenario: Respect the C001 operating envelope
    Then the CLI re-checks current C001 local-only consent before it listens, binds only 127.0.0.1 on an automatic port and accepts no overrides
    And the scope record states that identity is fake, nothing is registered, and live Azure runs and spend are 0
    And the listener closes itself after a bounded lifetime
    And IaC is N/A with no Dockerfile, Bicep, deployment, registration or spending

  Scenario: Inspect allowed and forbidden outcomes in a real browser
    Given the local page is open with no token
    When a conductor, the operator, a visitor, a forged and an expired token are each pasted and every command is checked
    Then the page shows exactly the server's decisions and typed error codes
    And a claimed-role selector never changes them
    And a command sent from the isolated read-only browser is reported as not sent with no server decision
    And the displayed revision stays unchanged, while real POST outcomes are proven over real loopback sockets in Node
