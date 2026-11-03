Feature: C003 local host and deployment-format capability matrix
  The H001/H002 visitor can inspect documented capabilities without gaining
  permission to deploy, spend, register identities, generate IaC, or run Azure.

  Scenario: Distinguish documentation, plans, qualification, and uncertainty
    Given the versioned documented-baseline matrix
    When the visitor opens the local component
    Then planned, documented-supported, qualified, unsupported, and unknown have distinct labels
    And qualified has zero entries and an explicit native-evidence requirement
    And every native adapter and configuration remains unqualified
    And six or ten completed synthetic lessons do not qualify native Azure

  Scenario: Preserve the approved design without selecting a native configuration
    Given the immutable C001 design and local-implementation approval
    Then Node.js 24 LTS with Express on App Service Linux is a design
    And Node.js 22.23.4 is test tooling, not production-runtime validation
    And the first planned native target is App Service code deployment slots
    And its OS, SKU, subscription, resource group, and region remain unapproved
    And all cloud, IaC, scaffold, registration, deployment, and expenditure flags are false

  Scenario: Explain platform-specific boundaries rather than promise availability
    Then App Service slots share compute and strict warm-up is required
    And Linux and container native auto-swap are unsupported
    And HTTP automatic scaling does not support deployment-slot traffic
    And Container Apps uses revisions, not App Service slots
    And AKS weighted routing needs a capable selected gateway or equivalent
    And PDB protection is scoped to voluntary Eviction API disruption
    And Functions slots require a supporting plan and can terminate execution
    And Flex has no slots and update completion and continuity have limits
    And Spring Boot is a runtime whose routing depends on its selected host

  Scenario: Filter locally using the keyboard
    Given the matrix is visible
    When the visitor combines host, format, status, and text filters
    Then only matching rows and a live result count are shown
    And an empty result has an explicit explanation
    And unsupported rows retain reasons and have no run or management action
    And a qualified filter shows no native proof rather than synthetic success

  Scenario: Reject invalid or authority-promoting local input
    Given a valid matrix has been displayed
    When malformed JSON, an incompatible version, or an invalid row is inspected
    Then old rows are removed and an accessible error explains rejection
    And native-qualified claims, evidence, and true permission flags are rejected
    And unapproved concrete target fields and mismatched support labels are rejected
    And no imported text is interpreted as HTML or code
    And restoring the documented baseline works without a network request

  Scenario: Keep scope, provenance, and evidence honest
    Then source README and backlog references and documentation URLs are visible
    And source verification scope and unresolved target availability are explicit
    And the contract is typed, versioned, JSON-compatible, and validated fail-closed
    And the component has a restrictive local-content security policy
    And all reported checks are actual local checks with relative redacted evidence
    And IaC is not applicable and no management call or permission-conferring control exists
