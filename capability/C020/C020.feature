Feature: Compatible, immutable, synthetic getProfile implementations
  C020 is a local H005 fixture, not a deployed control API.
  v1 and v2 name implementations of the same getProfile/1 API contract.
  All business data is synthetic and transport is loopback-only HTTP.

  Scenario Outline: Both implementations preserve stable profile semantics
    Given the immutable synthetic profile "<profileId>"
    When the profile is read through both v1 and v2
    Then both responses use the getProfile/1 API contract
    And their profile values are identical to the expected synthetic profile
    And an unchanged old consumer obtains the same result from both
    And their implementation versions and local deployment labels differ
    Examples:
      | profileId     |
      | synthetic-001 |
      | synthetic-002 |

  Scenario: Caller input cannot forge implementation or deployment observations
    Given a caller supplies a version or deployment override
    When either fixture receives extra request fields or query parameters
    Then the request fails explicitly without a profile
    And caller-supplied HTTP version headers never replace server-owned stamps

  Scenario: No caller can mutate another profile read
    Given a profile has been returned by either implementation
    When a caller attempts to mutate nested preferences, collections, or stamps
    Then the returned object and the source catalog are immutable
    And subsequent reads by either implementation retain the original values
    And separate responses do not share profile object references

  Scenario Outline: Invalid requests do not receive healthy defaults
    When either implementation receives "<invalid input>"
    Then an explicit invalid-request or unknown-profile error is returned
    And no fallback identity, profile, implementation, or successful result is invented
    Examples:
      | invalid input                    |
      | missing profileId                |
      | blank or malformed profileId     |
      | unknown synthetic profileId      |
      | duplicate profileId query fields |
      | unknown implementation           |
      | accessor or inherited input      |

  Scenario: Inspect compatibility and stamps in a real browser
    Given the local inspection page initially reports no observations
    When the conductor inspects a known synthetic profile
    Then both actual loopback responses and their stamps are visible
    And the old-consumer compatibility result is visible
    When the conductor subsequently requests an unknown profile
    Then the page reports unverified failure and clears prior successful observations

  Scenario: Malformed observations cannot pass browser inspection
    Given the inspector expects a particular implementation and synthetic profile
    When a candidate has a missing or forged stamp, wrong profile, wrong contract, or invalid JSON
    Then inspection rejects it explicitly rather than defaulting to healthy

  Scenario: Respect the C001 operating envelope
    Then the CLI binds only to 127.0.0.1 and rechecks C001 local-probe consent
    And the page identifies synthetic data and local-only transport
    And no identity verification, authorization boundary, durable store, or native qualification is claimed
    And IaC is N/A with no Dockerfile, Bicep, deployment, registration, or spending
    And Node builtins on the observed test runtime are not presented as the approved Node24 Express control API
