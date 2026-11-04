Feature: S142 burst demand competes with initialization in a declared envelope
  The original A-S142 satisfier belongs to D-S142, P1, SC-S142, SOURCE.
  All demand, load, initialization, tier, resource, contention, queue, latency,
  health, throughput, version and journey records are fixed fictional teaching data.
  No load generator, benchmark, network, cloud or user-data operation is conducted.

  Background:
    Given "Training rehearsal - synthetic data - not a live Azure result"
    And a fixed demand ceiling of 120 fictional requests per second
    And combined initialization and demand limits of 100 connections and 85 percent CPU
    And queue limits of 20 entries and 300 milliseconds wait
    And an initialization budget of 1000 milliseconds
    And an original complete-journey budget of 1500 milliseconds
    And a fixed observation window of 0 through 2000 fictional milliseconds

  Scenario: Separate passing tier samples cannot certify a coupled burst
    Given every separate tier sample passes and the readiness record is true
    When I record initialization and conduct the fixed contention burst
    And inspect the shared-resource rows before measuring journeys
    Then the known 115 connection and 90 percent CPU contention is a FAIL
    And queue and initialization budget failures are explicit
    And average throughput of 118 is not an uninterrupted-transition verdict
    And all four started journeys remain in the denominator
    And one uninterrupted, two interrupted and one unknown yield 1 / 4

  Scenario: Boundary-inclusive positive fixture
    When I conduct and inspect the within-envelope fixed burst
    Then 100 combined connections and 85 percent CPU are within the envelope
    And queue depth 20 and wait 300 are within the envelope
    And a 1500 millisecond correct migrated journey is within its original budget
    And all four journeys are uninterrupted with observed intended tier-version movement
    And the synthetic measurement is PASS, not native proof or five-nines certification

  Scenario: Missing peak evidence and unresolved started journeys remain unknown
    When I conduct and inspect the unobserved-peak fixed burst
    Then missing shared connections, queue wait and initialization completion remain unknown
    And a completed old-version-only journey is not certified as a migrated success
    And two unknown started journeys stay in the four-journey denominator
    And recovery samples cannot fill the missing earlier observation

  Scenario: Recovery retains previous interruption and measurement history
    Given I measured the contention burst
    When I record the fixed recovery row and inspect and measure again
    Then later healthy pressure does not remove earlier envelope failures
    And a recovered completion still has its original interruption and budget
    And both measurements and all commands remain visible in order

  Scenario: Typed replay and bounded reset
    Given a source-pinned replayed state
    Then malformed commands, out-of-order transitions and edited derived records are rejected
    And stale measurements cannot be reused without inspecting the new observation
    When I reset the rehearsal
    Then the next empty run retains all previous started journeys and measurements
    And a maximum of three runs and 23 commands rejects further destructive resets

  Scenario: Actual local browser conduct and safety
    Given the published isolated browser helper with SHA-256 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
    When I operate the real DOM using the keyboard
    Then positive, negative and unknown records render with exact denominators
    And bad selection or missing-script errors are visible without corrupting history
    And reset does not shadow the form reset method or erase prior interrupted journeys
    And real inline script and inline style probes are blocked by CSP
    And no network or load operation is attempted
    And every owned browser closes in an awaited finally block
    And ordinary verification writes nothing in this lesson
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates unique raw evidence
