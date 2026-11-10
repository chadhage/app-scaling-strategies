Feature: Bounded lease capacity and spend reservations; concurrent over-admission is refused without consuming another lease's reservation
  C011 is a local, synthetic H001 fixture (class D), not the approved Node 24 Express control API and not an identity service.
  It is built on the accepted C009 authorization fixture (imported read-only and pinned in imports.json): the four fake identities
  (visitor, conductor-a, conductor-b, operator), the opaque bearer tokens, the deny-by-default role table and the refusal path of
  http-io.cjs (every refusal answers once, closes the connection, stops reading, and nothing behind it runs), and on the audit ring of C010.
  ONE shared pool holds capacity units and ONE spend ceiling in cost units. Each conductor is one lease with its own caps (units and spend)
  inside the pool. A reservation names its lease by the SUBJECT of the verified token, never by a client claim, and its spend is the
  units times a price from a server-side, closed, versioned price table. Capacity units and cost units are synthetic numbers: no real spend,
  no Entra, no cloud, no registration. The shared browser helper permits only GET, so the page observes allowances, reservations and
  refusals through GET and every POST outcome is proved over real loopback sockets in Node.

  Background:
    Given a pool of capacity units and a spend ceiling, a price table and a cap pair for conductor-a and for conductor-b
    And a fake clock the tests move; nothing sleeps to cross a deadline
    And an operator, a visitor and an anonymous client exist

  Scenario: A conductor reserves capacity and the books balance
    When conductor-a reserves units of a tier with an idempotency key
    Then the answer is HTTP 200 with outcome "ok" and a reservation in state "reserved" whose spend is the units times the price of the tier
    And the pool total equals the reserved sum plus the free headroom, for capacity units and for cost units, after every operation
    And the reserved units and spend of the lease never exceed its caps, and no number is negative, fractional or not finite

  Scenario Outline: Every bound refuses with a typed code that names it and has no effect
    Given the reservation would exceed the "<bound>"
    When conductor-a reserves it
    Then the answer is HTTP 409 with code "<code>" and the connection is closed
    And no reservation, counter, other lease or free headroom changed and the audit shows the refusal with unchanged figures
    Examples:
      | bound                         | code                       |
      | active reservations of lease  | RESERVATION_LIMIT_REACHED  |
      | capacity cap of the lease     | LEASE_CAP_EXCEEDED         |
      | spend cap of the lease        | LEASE_SPEND_CAP_EXCEEDED   |
      | capacity of the shared pool   | CAPACITY_EXCEEDED          |
      | spend ceiling of the pool     | SPEND_EXCEEDED             |

  Scenario: The bounds are checked in a fixed order, the lease's own first
    Given a reservation that exceeds the lease cap and the shared pool at once
    Then the code names the lease cap, so a refusal never reveals the pool state of other leases to a caller that is over its own cap

  Scenario: Concurrent reserves race for the last unit and exactly one wins
    Given the pool has exactly one unit free
    When many connections reserve one unit at the same time, from both conductors
    Then exactly one is admitted and every other answer is a typed refusal with no effect
    And the check and the commit are one synchronous step of the store with no await between them

  Scenario: Two leases race one pool and neither consumes the other's reservation
    Given conductor-a and conductor-b both hold reservations
    When either of them is refused for capacity, spend or its cap, or releases, retries, expires or sends a foreign id
    Then the reservations of the other lease keep their units, spend, state and deadline
    And no refusal evicts, shrinks, releases or reads the reservation of another lease

  Scenario: A request that waited and lost its connection has no effect
    Given a reservation request waits in the queue
    When its socket is refused, destroyed or cut, or its token expires, before it is committed
    Then nothing is reserved, nothing is audited as admitted and nothing is answered
    And a request queued behind a refusal, a parse error, a request without Host, an Expect header, a bad chunk or a cut body never reserves

  Scenario: An idempotency key makes a retry safe and is scoped to its lease
    When conductor-a repeats a reserve with the same key and the same body
    Then the same reservation is returned and nothing more is reserved
    And the same key with another body is a typed conflict IDEMPOTENCY_CONFLICT with no effect
    And conductor-b's identical key is independent and nothing tells it that another lease used that key
    And many simultaneous requests with one key reserve once

  Scenario: Release and expiry return exactly what was reserved
    When conductor-a releases a reservation, or the fake clock reaches its deadline
    Then its units and spend return to the pool and to the lease, once
    And a released or expired reservation cannot be reused, released again or spent again, and a second release answers the same reservation without a change

  Scenario: Nothing leaks across leases
    When conductor-b reads, lists, counts or releases a reservation of conductor-a, or asks for its allowance or audit
    Then a foreign reservation and an absent one answer one byte-identical typed refusal that echoes no id, the same counted work is done, and every refusal closes the connection
    And lists, counts and the allowance show only conductor-b's own reservations and caps; the shared pool total is the fixed contract figure and the pool's free headroom is shown to the operator only

  Scenario: Roles are decided by the server
    Then a visitor may read only its identity; a conductor may reserve, release, read, list, see its allowance and its own audit and send batches
    And the operator has an audited read-only view of the pool, the lease books and the audit, and may not reserve or release
    And a body, query or header that claims an owner, lease, role, subject, pool, cap, price, state or deadline is refused by name or reported in ignoredClaims, never honoured

  Scenario: A batch is all or nothing
    When a batch holds an own reserve and an over-limit or foreign operation
    Then the whole batch is refused with the code and the index of the first failing operation and nothing was reserved or released

  Scenario Outline: Hostile numbers and bodies are refused with a typed code
    When conductor-a reserves with "<value>" as the units, or as the key
    Then the answer is a typed refusal with no effect
    Examples:
      | value                                                                                          |
      | a string, an array, an object, null, true                                                     |
      | negative, zero, -0, fractional, an exponent form, a leading zero, NaN, Infinity               |
      | 2^53, a digit string of 400 digits, a duplicate JSON key, __proto__, a mass-assigned field     |

  Scenario: The audit is bounded, complete and visible to its owner and the operator only
    Then every admit, refusal with its bound, release, replay and expiry is appended with the figures before and after
    And a conductor sees only its own records without pool figures, the operator sees all records, and no record holds a token, a key or any client claim

  Scenario: Configuration is closed and validated at start
    When a server is started with a pool, cap, price, ttl or limit that is not a closed, positive, safe integer inside the contract bounds
    Then start is refused with CONFIG_INVALID, nothing is left behind and the error echoes no supplied value
    And the default limits order the idle timeout above the header timeout plus the check interval, so a stalled header or body gets the typed 408 with its audit record

  Scenario: The inspection page derives every outcome from facts
    Given the page runs in a real Edge as each identity
    Then it shows allowances, reserved and free figures and refusals re-derived from status, typed code and body shape, never from server prose
