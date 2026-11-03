Feature: A-S005 isolated tenant migration rehearsal
  # Source: README.md S005; .docs/wiki/backlog.md D-S005;
  # .docs/wiki/kanban.md portable A-card contract and A-S005.
  # All tenants, clocks, requests, data, ownership and effects are synthetic.

  Background:
    Given the portable lesson starts with the explicit "S005-fixture-v1" dataset
    And cedar, birch and maple route to source with exclusive source ownership at fence 1
    And target data has not been synchronized
    And the synthetic clock starts at step 0

  Scenario: Abort migration before data synchronization
    When I attempt to migrate cedar to target
    Then the attempt is blocked as "not-synchronized"
    And cedar's configured route and ownership stay at source
    And there are no business effects or unrelated tenant changes
    And an intended target is not presented as an observed target request

  Scenario: Synchronize and atomically transfer one tenant
    When I observe a cedar request at source
    And I synchronize cedar's source data to target
    And I transfer cedar's ownership and route to target
    Then cedar has one target owner at fence 2
    And the copied data matches the source revision
    And migration itself has no observed request or business effect
    When I observe a cedar request and run one routed write and background job
    Then the observed destination is target
    And exactly one write and one background effect are attributed to target
    And birch and maple retain their routes, data, owners, fences and effects

  Scenario: Writes invalidate a synchronized snapshot
    When I synchronize cedar
    And a source write advances cedar's revision
    Then attempting cedar's migration is blocked as "not-synchronized"
    When I synchronize the newer revision and migrate cedar
    Then migration is allowed without losing the source write

  Scenario: Dual ownership fails closed
    Given cedar has been synchronized
    When I load the explicitly unsafe dual-owner fixture for cedar
    Then migration, routed reads, writes and background effects are blocked as "dual-ownership"
    And no business effect is duplicated
    And unrelated tenants are unchanged

  Scenario: An old source worker cannot operate after handoff
    Given cedar has been synchronized and migrated
    When a source worker replays its captured fence 1
    Then it is blocked as "stale-fence"
    And no source or target business effect occurs

  Scenario: Detect and reject unrelated-tenant drift
    When I inspect a deliberately unsafe proposal that changes an unrelated tenant's route
    Then the isolation verifier identifies the unrelated tenant
    And the proposal is blocked as "unrelated-tenant-change"
    And the proposed change is not applied to any tenant

  Scenario Outline: Reject unsupported input without changing tenant state
    When a form submits <input>
    Then the result is blocked with an explicit unsupported-input reason
    And no tenant route, data, ownership or effect changes

    Examples:
      | input                     |
      | an unknown tenant         |
      | an unknown action         |
      | a missing action          |
      | an inherited object key   |
      | an extra destination key  |

  Scenario: Reset using native browser form behavior
    Given I have changed the tenant selection and executed an unsafe attempt
    When I reach Reset by keyboard and activate it
    Then all synthetic state, observations, effects, traces and clock return to the initial fixture
    And the tenant selection returns to cedar
    And the form's reset and submit methods remain native callable functions

  Scenario: Keep scope and evidence honest
    Then the page visibly says "Training rehearsal - synthetic data - not a live Azure result"
    And the page uses only local HTML, JavaScript and CSS with a restrictive CSP
    And no credentials, management requests, actual database operation or cloud operation occur
    And browser verification uses a dedicated forceNew real browser page, not a Node DOM fixture
    And IaC is explicitly not applicable to this resource-free learning card
