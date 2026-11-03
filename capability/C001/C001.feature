Feature: C001 records approved local choices without granting cloud authority
  The repository-owner approved design and local implementation only.
  The authority is approvals.C001 published in commit
  26747d4fbbd51235c612dbd9d8c92ab335aef78e, not a visitor's approval field.

  Scenario: Inspect the exact, immutable approved contract
    Given the published operator approval is present and unchanged
    When an operator opens the C001 contract summary
    Then the decision owner is "repository-owner"
    And the frontend is "Portable HTML/JavaScript lessons"
    And the production target is "Node.js 24 LTS" with "Express" on "App Service Linux"
    And authentication is "Microsoft Entra ID: single tenant with invited guests"
    And authorization is "Public catalog; server-enforced conductor/operator roles and lease ownership"
    And control state uses Azure Storage Tables, Azure Storage Queues, and Azure Blob Storage
    And the first planned native provider is "App Service: code deployment slots"
    And the preferred future IaC format is "Bicep"
    And the contract and its nested values cannot be mutated
    And Node.js 22.23.4 is labelled test tooling, not production runtime validation

  Scenario Outline: Allow only a validated, side-effect-free local inspection
    Given the current operator approval exactly matches the pinned approved snapshot
    When the operator probes "<action>"
    Then the decision is allowed
    And nothing is executed
    And the native execution limit remains 0
    And authorized cloud spend remains forbidden at 0

    Examples:
      | action        |
      | local.summary |
      | local.probe   |

  Scenario Outline: Fail closed for operations without human approval
    Given only design and local implementation are approved
    When the operator probes "<action>"
    Then the decision is denied with reason "<reason>"
    And the result identifies the local-only operating envelope
    And no Azure, identity, deployment, IaC, or spending operation is executed

    Examples:
      | action             | reason                             |
      | native.execute     | LIVE_AZURE_NOT_APPROVED             |
      | native.provision   | LIVE_AZURE_NOT_APPROVED             |
      | iac.generate       | IAC_GENERATION_NOT_APPROVED         |
      | scaffold.generate  | SCAFFOLD_NOT_APPROVED               |
      | deployment.execute | DEPLOYMENT_NOT_APPROVED             |
      | identity.register  | IDENTITY_REGISTRATION_NOT_APPROVED |
      | spend.authorize    | EXPENDITURE_NOT_APPROVED            |
      | visitor.approve    | UNKNOWN_ACTION                     |

  Scenario: Unresolved native choices are visible, not inferred
    Given App Service Linux is the selected control-service hosting
    And native-target OS, SKU, subscription, resource group, and region are unapproved
    When the operator probes "native.execute"
    Then all five unresolved native choices are reported
    And no native OS is inferred from control-service hosting
    And a zero spend limit is not described as an approved free resource

  Scenario Outline: Reject incomplete, changed, or visitor-supplied consent
    Given the approval input is "<input>"
    When "local.probe" or "native.execute" is evaluated
    Then both decisions are denied with explicit validation reasons

    Examples:
      | input                                                  |
      | missing                                                |
      | missing runtime                                        |
      | blank decision owner                                   |
      | changed production runtime                             |
      | approved=true without the operator snapshot             |
      | operator snapshot plus an extra approved=true field     |
      | operator snapshot with a live approval flag set to true |
      | changed zero operating limits                          |

  Scenario: The local command checks current authority, not a visitor override
    Given the command reads .docs/wiki/flow-state.json at approvals.C001
    When the file or approval is missing, malformed, or different from the pinned snapshot
    Then even "local.summary" is denied
    And a command-line approved=true argument cannot grant authority

  Scenario: Keyboard inspection is read-only and network-free
    Given the operator opens the standalone C001 file page
    When the operator inspects the read-only summary
    And uses Tab, Enter, and the action selector to probe local and native actions
    Then the live result announces an allowed local probe and a denied native probe
    And there are no approval-editing controls, forms, or network requests
    And the page states it is a snapshot/probe, not server-side enforcement or a native qualification

  Scenario: Missing browser dependencies fail closed
    Given the approved snapshot or validator cannot load
    When the operator opens the C001 page
    Then the probe stays disabled
    And an explicit unavailable/denied message is shown
