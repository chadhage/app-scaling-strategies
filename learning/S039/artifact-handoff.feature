Feature: Required instance-local temporary state survives an ownership handoff only when externalized
  # A-S039 / D-S039 / SC-S039; one synthetic satisfier, not native proof.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And one fixed synthetic upload, workflow checkpoint, or generated artifact
    And owner A and a distinct empty owner B
    And all shared/durable storage is an in-memory teaching model

  Scenario Outline: Verify the required bytes and checkpoint after ownership changes
    Given I prepare "<kind>" in "<storage>" storage with intact observations
    When I hand ownership from A to B
    And I read the artifact as its new owner
    Then the verdict is "<verdict>"
    And exactly one artifact journey is attempted
    And an empty HTTP-like 200 response is never sufficient for success
    And the expected bytes and workflow checkpoint remain available for comparison

    Examples:
      | kind      | storage | verdict |
      | upload    | durable | success |
      | workflow  | durable | success |
      | generated | durable | success |
      | upload    | local   | failure |
      | workflow  | local   | failure |
      | generated | local   | failure |

  Scenario: A misleading successful response hides missing state
    Given I prepare an upload in durable storage with an empty-200 observation
    When I hand ownership from A to B and verify
    Then response status 200 and zero observed bytes are displayed
    And missing bytes and checkpoint are classified as an interruption
    And no success is claimed

  Scenario: Correct byte count does not hide corruption
    Given I prepare a generated artifact in durable storage with corrupt observations
    When I hand ownership from A to B and verify
    Then altered bytes of the same length fail the exact-byte and checksum checks
    And the retained expected artifact is unchanged

  Scenario: Bytes alone cannot hide a lost workflow checkpoint
    Given I prepare a workflow in durable storage with a missing-checkpoint observation
    When I hand ownership from A to B and verify
    Then matching bytes do not override the failed checkpoint assertion
    And the verdict is failure

  Scenario: Missing observation is unknown, not observed loss or success
    Given I prepare an artifact with unavailable observations
    When I hand ownership from A to B and verify
    Then the attempted journey is unknown
    And response status, byte count and checkpoint checks are unobserved

  Scenario: Configuration and state guards are non-destructive
    Given only fixed enumerated kinds, stores and observations are supported
    Then non-plain input, unknown fields and non-string values are rejected
    And verification before handoff and repeated preparation or handoff are rejected
    And invalid operations never change the current state or retained history
    And returned snapshots cannot mutate the internal fixture or history

  Scenario: Retain failures and unknowns across a keyboard reset
    Given I have observed a failure and an unknown result
    When I activate Reset using the keyboard
    Then defaults, owner A and an untested current run are restored
    And focus returns to the artifact selector
    And earlier results and their sampled bytes remain in history
    And page-lifetime limits are not replenished

  Scenario: Bound every rehearsal
    Given at most 12 runs and 12 verified journeys per page lifetime
    Then exhausted actions reject without mutation
    And there are no timers, random choices, storage writes or management calls
    And native keyboard controls and focused error announcements work
    And CSP blocks inline execution and outbound connections
