Feature: Execute a bounded preset automatically through the SAME validated steps as manual operation
  C043 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 with an ephemeral port (Node built-ins only). A preset is a
  declared, versioned, closed-contract sequence of C042 "reserve-capacity" step inputs with explicit bounds (maximum
  steps, maximum duration on an INJECTED clock, maximum synthetic units). It is not the approved Node 24 / Express
  control API, validates no production runtime, registers no identity and calls no cloud service. Training rehearsal:
  synthetic data, not a live Azure result. Gate C042 is accepted; C017 reconciliation is NOT implemented (no undo).

  Background:
    Given the accepted C042 step service (pinned, read-only) over a local journal and two fictional leases (100 and 10 units)
    And the closed preset contract C043-preset/1 (schemaVersion, preset, idempotencyKey, bounds, steps)

  Scenario Outline: An invalid preset is a typed failure with C042's recovery actions and NO effect
    When the preset has <defect>
    Then the answer is a typed failure with code <code>, recovery correct-and-resubmit, and no step function was called
    And the lease ledger, the step journal and the preset journal are unchanged
    Examples:
      | defect | code |
      | an unknown schema version | UNSUPPORTED_PRESET_VERSION |
      | an unknown key | UNKNOWN_FIELD |
      | a __proto__ key, also escaped | FORBIDDEN_FIELD |
      | a duplicated JSON key | DUPLICATE_FIELD |
      | more steps than the contract allows | TOO_MANY_STEPS |
      | an invalid step input in the LAST position | the C042 input code with a steps[n] path |
      | two steps with one idempotency key | DUPLICATE_STEP_KEY |

  Scenario: The automatic runner invokes the same validated steps as manual operation
    Given a spy at the shared step boundary
    When the steps are submitted one by one by hand and the same steps run as a preset on a fresh service
    Then both runs produce identical call sequences, arguments, results and step-journal records
    And a differential property test over seeded random presets agrees on every one

  Scenario: A runner that bypasses validation or keeps a private copy of the steps fails a named test
    When the runner is mutated to skip validation, to call a private engine, or to ignore a bound
    Then a test named for that guard fails

  Scenario: The preset stops at the first failed step and lists what ran, what did not and which effects stand
    When step 2 of 3 is refused (capacity) or its executor fails or it is unconfirmed
    Then step 3 is never called and the answer lists ran, not-run and the standing effects of step 1
    And nothing is undone and no undo is invented

  Scenario Outline: A bound exceeded is a typed PRESET_BOUND_EXCEEDED with the same honest listing
    When the preset exceeds <bound>
    Then the answer is PRESET_BOUND_EXCEEDED, never a success, with the exact listing
    Examples:
      | bound |
      | maxSteps |
      | maxUnits |
      | maxDurationMs on the injected clock |

  Scenario: Re-running a preset with the same idempotency key gives one set of effects and the same result
    When the same preset is sent again, also in parallel
    Then the result is the recorded one, replayed, and the ledger shows exactly one set of effects
    And the same key with a different preset is IDEMPOTENCY_KEY_CONFLICT

  Scenario: Cancellation is explicit and never a success
    When a preset is cancelled between steps or while a step is in flight
    Then the answer is CANCELLED with the exact listing, and a cancel that arrives too late is not a success

  Scenario: A restart resumes from the journals and never re-executes an acknowledged step
    Given a service stopped in the middle of a preset
    When a new service replays both journals
    Then the preset is INTERRUPTED until an explicit resume
    And resume continues at the first unacknowledged step and the acknowledged steps are not called again

  Scenario: Only the offered recovery controls execute
    Given any result with its offered recovery actions
    When each offered action is used and a non-offered action is attempted
    Then the offered ones work as described and the others are typed refusals

  Scenario: The page runs a preset and shows validated progress, results and controls
    When the user chooses a preset and runs it with the keyboard
    Then every answer is validated and its wording is re-derived from facts, never printed from the server
    And a tampered state, result or failure is rejected and shown as such

  Scenario: Browser observation is limited to GET
    Given the isolated browser helper allows only GET
    Then the real browser observes a server-produced transcript plus read-only inspection
    And the README states that the POST actions are proved with real sockets in node:test

  Scenario: Resource bounds and journal integrity hold
    When a refusal flood, slow clients, journal single-byte flips and reserved Windows names are tried
    Then the server stays responsive, every flip is detected or reported, and no hostile name is accepted
