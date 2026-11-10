Feature: Lease ownership on every resource target; another conductor's resources stay inaccessible
  C010 is a local, synthetic H003 fixture, not the approved Node 24 Express control API and not an identity service.
  It is built on the accepted C009 authorization fixture (imported read-only and pinned in imports.json): the four fake identities
  (visitor, conductor-a, conductor-b, operator), the opaque bearer tokens, the deny-by-default role table and the refusal path of
  http-io.cjs (every refusal answers once, closes the connection, stops reading, and nothing behind it runs).
  A lease has one owner (the subject of the verified token, never a client claim), an expiry and resources of three kinds: runs,
  scratch resources and exports. Every route that names a target of any kind decides ownership on the server, deny by default, and
  decides it AGAIN where the effect is committed. All data is synthetic; no Entra, cloud, registration or spend is involved.
  The shared browser helper permits only GET and HEAD, so the page observes allowed and forbidden outcomes through GET and every
  POST, PATCH and DELETE outcome is proved over real loopback sockets in Node.

  Background:
    Given conductor-a owns a lease with a run, a scratch resource and an export of that run
    And conductor-b owns a lease with a run, a scratch resource and an export of that run
    And an operator, a visitor and an anonymous client exist

  Scenario Outline: A conductor reaches its own resources with every verb
    When conductor-a sends "<verb>" for its own "<kind>" with valid input
    Then the answer is HTTP 200 with outcome "ok" and shows only its own data
    Examples:
      | verb   | kind    |
      | read   | lease   |
      | list   | runs    |
      | create | scratch |
      | update | run     |
      | cancel | run     |
      | delete | export  |
      | end    | lease   |

  Scenario Outline: Another conductor's resources are inaccessible for every kind and every verb
    When conductor-b sends "<verb>" naming the "<kind>" of conductor-a's lease
    Then the answer is HTTP 404 with code "TARGET_NOT_FOUND" and the connection is closed
    And the full server state is unchanged
    Examples:
      | verb   | kind      |
      | read   | lease     |
      | list   | runs      |
      | list   | scratches |
      | list   | exports   |
      | create | run       |
      | create | scratch   |
      | create | export    |
      | read   | run       |
      | read   | scratch   |
      | read   | export    |
      | update | run       |
      | update | scratch   |
      | cancel | run       |
      | delete | run       |
      | delete | scratch   |
      | delete | export    |
      | end    | lease     |

  Scenario: A foreign resource and an absent resource are indistinguishable
    When conductor-b names a resource of conductor-a and a well formed id that exists nowhere, on every route and verb
    Then the two answers carry the same status, the same headers, byte-identical bodies and the same length
    And neither answer echoes the id, the owner or any server prose that depends on the target
    And the work the store does for the two requests is the same (counted, not timed)
    And a conditional request (If-None-Match, If-Match, If-Modified-Since) changes neither answer and no ETag is ever sent

  Scenario: Lists, counts, pagination, search, filters and sort show only the caller's resources
    Given both conductors hold resources with the same names
    When conductor-b lists, pages, filters, searches and sorts its own leases and resources
    Then every item belongs to conductor-b and the totals count only conductor-b's own items
    And a query parameter that names an owner, a lease or a method override is refused with no effect

  Scenario: A visitor reaches no lease and the operator reaches only audited metadata
    When a visitor sends any lease route
    Then the answer is HTTP 403 with code "ROLE_FORBIDDEN"
    When the operator sends any conductor route
    Then the answer is HTTP 403 with code "ROLE_FORBIDDEN"
    When the operator reads the lease metadata and the audit view
    Then it sees owners, expiries and counts but no resource id, name or content, and each read is itself audited

  Scenario: Anonymous callers see nothing
    Given there is no public state route
    When an anonymous client sends every route
    Then only the page assets and the fixed scope answer, and no answer contains an owner subject or a resource id
    And a missing, malformed, forged or expired token is refused with its typed 401 and never read as anonymous

  Scenario: Hostile ids, paths, methods and fields are refused uniformly
    When ids are guessed, sequential, case varied, percent encoded twice, dotted, padded, look-alike or very long
    And method override headers and query switches are sent
    And a body names an owner, a lease, a subject, a role or a server field
    Then nothing is created, read, changed or deleted and the answers are typed refusals

  Scenario: A batch naming one own and one foreign target is refused as a whole
    When conductor-b sends a batch with one of its own targets and one target of conductor-a
    Then the answer is the uniform refusal, no operation of the batch was applied, and the state is unchanged

  Scenario: A resource may not reference a foreign resource
    When conductor-b creates an export that names a run of conductor-a, or a run of another of its own leases
    Then the answer is the uniform refusal and nothing was created

  Scenario: A lease cannot be transferred
    When any identity sends an owner, a lease id or a subject in a body, a query or a header
    Then the claim is refused or ignored by name and the owner of every lease is unchanged

  Scenario: An ended or expired lease reaches nothing
    Given a lease whose lifetime is over but whose conductor token is still valid
    Then every route naming it answers as if it never existed
    And a token that expired is refused 401 TOKEN_EXPIRED and has no effect

  Scenario: The decision is repeated where the effect is committed
    Given a mutating request waits in the queue
    When its lease ends, expires or moves to another owner, or its token expires, before it commits
    Then it has no effect and answers the uniform refusal or its typed 401

  Scenario: A batch naming a foreign target never reaches the commit gate
    When conductor-b sends a batch that names a target of conductor-a, alone or after one of its own targets
    Then the answer is the uniform refusal before the queue, the commit gate is never reached and the state is unchanged
    And a batch of own targets reaches the gate once and is applied

  Scenario: A connection that ended or was refused while its mutation waited gives it no effect
    Given an authorized mutation is waiting for the rest of its body or at the commit gate
    When its connection is destroyed (the client left, or the lane cut it) or marked as refused
    Then the mutation is not committed, no audit record is written and no answer is sent

  Scenario: Deleting or changing one resource touches nothing else of the owner
    When a run is deleted, or a resource is patched
    Then only the exports of that run go with it, and the lease keeps its name, owner and expiry

  Scenario: One conductor filling its quota cannot starve another lease or the operator
    When conductor-a fills its own share of the state
    Then conductor-b can still create and the operator can still read, and conductor-a gets OWNER_QUOTA_FULL with no effect

  Scenario: Every refusal closes the connection and nothing behind it runs
    When a refusal of any status is the first, a later, or an asynchronously decided request of a connection
    Then the answer carries Connection: close, the server ends the connection, and a valid mutation pipelined behind it never runs
    And the same holds for HTTP/1.0, for what Node answers by itself (417, no Host, parse errors, 431, 408, CONNECT) and with two or three
    legitimate requests before the refusal, in the test process and in a separate server process
    And a refusal flood from another process leaves every socket closed and a legitimate request answered

  Scenario: The inspection page re-derives every outcome from facts
    Given a real isolated headless Edge opens the page with the four tokens
    Then each row shows allowed or forbidden as derived from the status, the typed code and the body shape, never from server prose
    And a tampered answer is shown as a violation and nothing is announced as allowed by itself

  Scenario: Random operation sequences keep the global invariant
    Given a seeded random sequence of lease, resource, read, list, update, delete, cancel, reference, batch, expire and duplicate operations by every identity
    Then after every operation no identity has observed or changed a resource of a lease it does not own and every refusal had no effect
