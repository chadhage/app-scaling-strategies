Feature: S038 tenant authorization continuity after routing changes
  # A-S038 / D-S038 / SC-S038; one frozen S unit, synthetic browser lesson only.
  Background:
    Given two synthetic members belong to tenants Alba and Birch respectively
    And v1 and v2 are both directly reachable before and after the routing change
    And each member may read only its own tenant's synthetic record
    And both versions enforce that rule before the change
    And no authentication, cloud, network, or persistent resource is used

  Scenario: Change both destinations without changing tenant permissions
    When the operator routes both tenants from v1 to v2
    And selects own-read permission, forbidden-read rejection, and data-tenant assertions
    And v2 retains the isolated policy
    Then all 16 before/after, version, member, and own/foreign probes succeed
    And forbidden reads explicitly return synthetic 403 with no data
    And both routed destinations and direct reachable versions are attributed

  Scenario: An unselected destination still needs authorization coverage
    When Alba stays on v1 and Birch moves to v2
    And v2 no longer checks the requesting member's tenant
    Then both foreign reads on v2 after the change return synthetic 200 with foreign data
    And the result is FAILURE with 14 successes, 2 failures, and 0 unknowns
    And the trace identifies Alba's v2 failure as a direct reachable-version probe

  Scenario: A successful own-read status can still expose another tenant's data
    When v2 returns the other tenant's record for an authorized read
    Then the data-tenant assertion fails for both v2 members after the change
    And a 200 response alone cannot establish authorization continuity

  Scenario: Over-restrictive permissions also break continuity
    When v2 rejects authorized own-tenant reads after the change
    Then both affected own-read probes fail
    And correct rejection of foreign reads does not hide lost permissions

  Scenario: Missing observations and missing assertions are not passes
    When v2 responses after the change are unobserved
    Then the result is UNKNOWN with 12 successes, 0 failures, and 4 unknowns
    When the operator omits the forbidden-read rejection assertion
    Then all 8 foreign-read probes are UNKNOWN even if their response is visible
    And an observed failed assertion takes precedence over missing coverage

  Scenario: Retain a failing run before a corrected run
    Given a completed run exposed cross-tenant access
    When the operator changes the policy and conducts a corrected run
    Then both immutable configurations, traces, counts, and outcomes remain in history
    And no more than 6 runs can be retained without an explicit reset
    And unchanged inputs reproduce the same synthetic trace

  Scenario: Reject invalid inputs or corrupted state without mutation
    When a route, policy, assertion record, or history is invalid
    Then the exercise reports an error without adding a run
    And coercions, unexpected keys, accessors, sparse arrays, and forged results are rejected

  Scenario: Operate, inspect, and reset with the keyboard
    Then the exact training banner is prominent
    And native controls, skip navigation, retained details, and reset work by keyboard
    And changed controls hide stale current results but retain historical failures
    And reset restores defaults, clears history and errors, and focuses the first route
    And CSP blocks inline code, connections, images, frames, workers, and form submission
