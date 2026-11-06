Feature: Conduct one validated workflow step with an explicit result and supported recovery controls
  C042 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 with an ephemeral port (Node built-ins only). It conducts ONE
  step of a fictional lease, "reserve-capacity", in synthetic integer units. It is not the approved Node 24 / Express
  control API, validates no production runtime, registers no identity and calls no cloud service. Training rehearsal:
  synthetic data, not a live Azure result. Gates C016, C019 and C035 are accepted; C017 reconciliation is NOT implemented.

  Background:
    Given a loopback service over a local append-only journal and two fictional leases (100 and 10 synthetic units)
    And the closed input contract C042-reserve-capacity-input/1 (schemaVersion, step, idempotencyKey, leaseId, units)

  Scenario: A valid step is conducted once and reports exactly what happened
    When a client submits a valid reserve-capacity input
    Then the result envelope says outcome succeeded, shows the validated inputs and the one recorded effect
    And it lists what did NOT happen (no second effect, no undo, no cloud call)
    And HTTP 2xx is returned only when the request was accepted

  Scenario Outline: Invalid input is a typed rejection with no effect and no journal entry
    When the body is <input>
    Then the outcome is rejected with typed code <code> and recovery correct-and-resubmit
    And the lease ledger and the journal are byte-for-byte unchanged and the key stays unused
    Examples:
      | input | code |
      | a missing field | REQUIRED_FIELD |
      | an extra field | UNKNOWN_FIELD |
      | units as a string, a fraction, 1e1 or negative zero | WRONG_TYPE or UNSAFE_NUMBER |
      | units 0, 11 or an unknown lease | FIELD_OUT_OF_RANGE |
      | a duplicated key, also written with escapes | DUPLICATE_FIELD |
      | __proto__, constructor or prototype, also escaped | FORBIDDEN_FIELD |
      | more than 2048 bytes | BODY_TOO_LARGE |
      | not JSON, empty, a BOM, invalid UTF-8 or a non-object | INVALID_JSON, REQUIRED_JSON or INVALID_SHAPE |

  Scenario: An unsupported step, version or action is a typed refusal
    When a well-formed request names another step, another schema version or an action such as undo
    Then the outcome is unsupported, nothing is changed and no undo is invented

  Scenario: A retry with the same idempotency key returns the same result with one effect
    Given a step that succeeded
    When the identical request is sent again, also by many parallel clients at once
    Then every answer carries the recorded result and exactly one begin and one commit exist
    And a retry never claims to have applied the effect itself

  Scenario: Reusing a key with different inputs is a typed conflict
    When the same key arrives with other units
    Then the outcome is rejected with IDEMPOTENCY_KEY_CONFLICT and nothing changes

  Scenario: Capacity is held while a step is in flight
    When parallel steps ask for more units than the lease has left
    Then only the steps that fit are admitted and the others are rejected CAPACITY_EXHAUSTED

  Scenario: A client that disappears mid-step cancels nothing
    Given a step in flight and a client whose connection is destroyed
    When the step finishes and the same request is retried
    Then the retry returns the one recorded success

  Scenario: An in-flight step can be cancelled explicitly and only then
    When a client cancels a step before its effect is recorded
    Then the step is cancelled, no effect exists and no undo is claimed
    And cancelling a succeeded or unknown step is a typed refusal that lists the allowed actions

  Scenario: A restart classifies unfinished work honestly and resume is explicit
    Given a service stopped while a step was in flight, so no terminal record exists
    When a new service replays the journal
    Then the step is interrupted with no effect and is never resumed or cancelled automatically
    And resume runs it to exactly one effect, and a torn final line is discarded without an effect

  Scenario: Uncertain persistence is unknown, never success
    Given the journal write fails
    Then the outcome is unknown with an unconfirmed effect, and a retry re-reads the journal to decide

  Scenario: Only the offered recovery controls execute
    Given any result with its offered recovery actions
    When each offered action is used and a non-offered action is attempted
    Then the offered ones work as described and the others are typed refusals

  Scenario: The page conducts the step and shows inputs, result and controls
    When the user submits with Tab and Enter, then uses an offered control
    Then the validated inputs, the explicit result, what did not happen and the controls are shown
    And a missing or invalid response is shown as unknown or rejected, never as success

  Scenario: Browser observation is limited to GET
    Given the isolated browser helper allows only GET
    Then the real browser observes a server-produced transcript page plus read-only inspection
    And the README states that the POST actions are proved with real sockets in node:test

  Scenario: Normal verification is hermetic and changes no retained evidence
    When the focused suites, the coverage gate and the browser run
    Then scratch lives under the namespace and is removed, no publisher or ledger bytes are pinned
