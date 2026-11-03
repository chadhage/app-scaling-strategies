Feature: C004 local run-consent plan data view
  C004 is one frozen satisfier, with H001 and H003 lineage.
  The approved operation is local-implementation-only, not an executor or production API.
  C001 supplies authority, C002 validates the unchanged explicit run-envelope request,
  and C003 supplies the unchanged documented host/format matrix.

  Scenario: Explicitly review a resource-free local plan
    Given the operator explicitly loads the labelled C002 synthetic comparison fixture
    And the plan declares local-resource-free mode, zero cloud resources, and no cloud execution
    And every comparison limit, duration basis, resource assumption, and price field is supplied
    When the plan is reviewed using the pinned C001 approval
    Then cost is not-applicable with no monetary amount or currency, not an Azure zero-cost estimate
    And comparison load, duration, capacity and their exact supplied limits are visible
    And a separate unchecked acknowledgement can record local plan review only
    And no operation is executed, no lease or capacity is reserved, and no cloud consent is granted

  Scenario Outline: An unpriced native proposal is blocked, never approved as free
    Given a native-proposal references an actual C003 configuration
    And its pricing status is <status> with null amount, currency, and source
    When it is reviewed
    Then a readable blocked plan remains available
    And it contains the explicit <code> reason and C001 native denial reasons
    And its monetary estimate remains null, never zero
    And local acknowledgement is unavailable
    Examples:
      | status  | code            |
      | missing | PRICING_MISSING |
      | unknown | PRICING_UNKNOWN |

  Scenario: Documentation and a user-supplied estimate are not native qualification or consent
    Given a native proposal selects a documented-supported C003 row
    And a positive user-supplied total estimate has explicit currency, basis, source and capture time
    When it is reviewed
    Then the estimate is visibly unverified, not a provider quote or authorized spend
    And documented support remains distinct from native qualified false
    And native execution, IaC, scaffold, deployment, identity and spend approvals are all false
    And liveAzureRuns is 0 and production Node.js 24 remains unvalidated
    And C001 denial reasons prevent any acknowledgement or execution

  Scenario: Unsupported or unknown configurations keep their exact matrix reasons
    Given a native proposal selects an unsupported or unknown C003 row
    When it is reviewed
    Then the matrix status, documented support, constraints and source references are shown unchanged
    And the plan is blocked with an explicit unsupported or unknown reason
    And no matrix status can be promoted by browser input

  Scenario: Invalid inputs do not receive defaults or stale approval
    Given a prior local plan has been acknowledged
    When either JSON input or any plan field is edited
    Then the previous plan and acknowledgement are invalidated immediately
    And malformed, duplicate, unsafe-number, missing-limit or unknown-field input has explicit path/code/message errors
    And no previous input, limit, monetary estimate or acknowledgement is substituted
    And a review that finishes after another edit is discarded

  Scenario: Only the current explicit local review may be acknowledged
    Given a current valid resource-free local plan
    When acknowledgement is absent, false, malformed, or attempted without a current review
    Then a precise rejection is returned and no consent is recorded
    When the operator checks the local-only acknowledgement and activates its button
    Then a fingerprint-bound in-memory local-plan-review-only record is shown
    And editing, rereviewing, loading either example, or resetting clears that record

  Scenario: Actual isolated headless keyboard, error, and reset acceptance
    Given the page is opened with testing\browser\isolated.cjs openIsolatedLesson
    And the pinned offline Playwright 1.56.1 uses signed installed Edge 156 with its sandbox enabled
    When the operator uses the real DOM, Tab, Space and Enter to review and acknowledge locally
    Then accessible labels, status, explicit blocking errors, literal text and focus recovery are observed
    And missing dependencies, changed pinned data or unavailable integrity fail closed
    And reset clears inputs, plan and consent and restores input focus
    And a narrow viewport has no horizontal page overflow
    And no remote request or browser page error occurs during normal use
    And the isolated session is awaited closed in finally before successful evidence is saved

  Scenario: Scope and evidence remain honest
    Given this resource-free local implementation
    Then IaC is recorded N/A after genuine loadable-stub behavioral RED and before implementation
    And raw RED, focused GREEN, syntax, integrity and real browser artifacts are retained
    And intentionally RED snapshots do not have auto-discovered test filenames
    And only capability\C004 is published and C004 awaits independent parent acceptance
    And H001, H003, native execution and remaining server-side controls are not claimed complete
