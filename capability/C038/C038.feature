Feature: Inspect explicit local instance and dependency readiness and freshness
  Original C038 is frozen S / P0 / LP-REPLAY, parent H007, entry accepted C036.
  Training rehearsal - synthetic data - not a live Azure result
  The only positive is a CLOSED SYNTHETIC observation model, not an actual pool.

  Scenario: A successful probe is not a pool inventory
    Given two explicitly fictional instances and their required dependency probes
    When only one instance has one complete successful HTTP 200 probe
    Then the synthetic pool decision is UNKNOWN / HOLD, never ready
    And no actual instance, capacity, lease ownership or native readiness is asserted

  Scenario: Complete compatible current coverage is the sole fictional positive
    Given the complete explicit expected instance and dependency inventories
    And every required node/probe has an independent complete request and response
    And their exact source, context, epoch, tier, version and state match
    And their declared fictional clock ages are nonnegative and strictly below TTL
    When the closed observations are inspected
    Then only CLOSED_SYNTHETIC_READY may be true
    And native, actual pool, authentication, lease and capacity flags remain false

  Scenario Outline: Missing information fails closed
    When <information> is absent, partial, unknown or ambiguous
    Then the result is UNKNOWN / HOLD with the missing reason visible
    Examples:
      | information |
      | explicit complete inventory |
      | instance |
      | dependency or required probe |
      | complete observation |
      | source and per-node context |
      | request or response correlation |
      | current epoch and compatible version |
      | declared clock or freshness |
      | unambiguous single clock domain |

  Scenario: Known failed and stale nodes cannot be outvoted
    Given all other nodes and dependencies pass
    When any required node is failed or stale
    Then the whole synthetic pool holds
    And a duplicate observation of the same node never fills a different node
    And an old, wrong-tier, wrong-version or wrong-context record never counts

  Scenario: Measure the declared TTL boundary exactly
    Given the fictional TTL is 10 ticks and now is 100
    Then age 9 is fresh, age 10 is stale and age 11 is stale
    And future time, unknown clocks and distributed-clock ambiguity hold
    And wall time and saved historical timestamps are not native freshness attestation

  Scenario: Preserve each original negative after later fresh observations and reset
    Given a failed, unknown or stale original inspection
    When a different complete fresh round is inspected and the display is reset
    Then each original result and its per-node findings remain immutable in history
    And replay protection and the bounded history limit remain
    And the current freshness decision does not repair client journeys or prove scaling

  Scenario: Reuse accepted sources without inventing linkage
    Given unchanged accepted C036 guards and the known read-only C015 public restore
    And unchanged accepted C020, C021, C024 and C034 prior art
    When actual saved C034 records are inspected
    Then they remain UNLINKED / UNKNOWN with their original failure and unknown history
    And C036's three fictional tiers are not an actual instance inventory
    And Node rereads current C015 but the static browser labels its bundled history

  Scenario: Strict bounded input cannot adopt caller verdicts
    When input has extra or inherited fields, wrong types, unsafe numbers, duplicates,
      wrong source pins, IDs, tier, version, context, coverage or replayed IDs
    Then inspection holds or rejects before any ready result
    And no caller-eligible, status-only or override field is accepted

  Scenario: A usable offline keyboard and CSP surface
    Given the exact training banner and native flags false
    When a learner selects, copies, edits, inspects, compares or resets JSON
    Then errors, coverage, original history and source limitations are visible
    And reset returns keyboard focus to the picker without clearing history
    And CSP blocks connections, inline scripts, frames, workers and forms

  Scenario: Immutable evidence and scoped publication
    Given BDD precedes a loadable stub and genuine one-probe false-positive AssertionError
    And IaC is N/A
    When focused tests and actual signed Edge DOM checks pass
    Then ordinary verification changes no source, retained fixture or evidence
    And only exact CAPTURE_BROWSER_EVIDENCE=1 appends unique raw proof
    And all RED and later failure bytes remain
    And current top parent authority is read under State and released before Publisher
    And only the exact current-approved standard publisher may publish owned C038
    And parent alone may accept one original S, with zero extra test or repair credit
