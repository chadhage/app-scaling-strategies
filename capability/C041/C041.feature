Feature: C041 hosts approved portable lessons without management authority
  The host is a reusable HTML/JavaScript training component, not a production app.
  A controller-accepted A lesson is not native B proof or parent-scenario completion.

  Scenario: Select only delivered lessons in the reviewed acceptance snapshot
    Given the read-only catalog pins accepted A-S001 and A-S003 and their asset hashes
    When the learner selects the exact ID A-S001
    Then only its pinned entry point is eligible for mounting
    And the host shows training, synthetic data, not a live Azure result, and no management access
    And file existence alone never adds a planned or unaccepted lesson to the catalog

  Scenario Outline: Reject selections without interpreting them as locations
    Given the host has an approved lesson selected
    When the learner submits "<selection>"
    Then the selection is refused without loading a URL or resolving a filesystem path
    And the previous frame is removed so it cannot be mistaken for the refused selection
    And no management operation is dispatched
    Examples:
      | selection                         |
      | A-S009                            |
      | B-S001                            |
      | https://example.invalid/lesson    |
      | javascript:alert(1)               |
      | ..\..\learning\S001\index.html    |
      | /learning/S001/index.html         |
      | __proto__                         |

  Scenario: Keep a real lesson interactive without sharing its origin
    Given the host is served by the bounded IPv4-loopback-only helper
    When the learner mounts A-S001
    Then the iframe has allow-scripts and does not have allow-same-origin
    And response CSP independently applies that sandbox to the lesson document
    And the original lesson bytes and original lesson CSP are unchanged
    And real keyboard activation changes the child's synthetic warm-up result
    And a child access to the parent document is denied by the browser
    And child script injection, network connection, and nested frames are denied by CSP
    And unsolicited child postMessage data cannot change selection or obtain management access

  Scenario: Navigate between host and child with the keyboard
    Given no lesson is initially mounted
    When the learner enters an approved ID and submits using the keyboard
    Then focus is not stolen from the submit control
    And the named iframe can receive focus without a keyboard trap
    And child controls remain keyboard-operable
    And reverse navigation can return to the host selection controls

  Scenario: Expose no repository or management service through the helper
    Given an explicit allowlist of host assets and pinned approved lesson assets
    When a request names a repository path, .git, a directory, traversal, or an unknown lesson
    Then no repository file or directory listing is returned
    And non-read methods and non-loopback Host headers are refused
    And no management, credential, cloud, registration, or expenditure action exists
    And the exact owned helper is stopped after browser verification

  Scenario: Fail closed if approved child assets drift
    Given an accepted lesson's recorded hash differs from its bytes
    When the helper verifies the catalog before listening
    Then it refuses to serve the changed lesson
    And new file existence cannot override acceptance or integrity checks

  Scenario: State the evidence boundary honestly
    Given real Node builtin behavioral RED precedes implementation
    When focused GREEN, syntax, HTTP, and real browser checks are recorded
    Then evidence uses relative paths and distinguishes each check
    And IaC is N/A because no infrastructure or live Azure execution is authorized
    And publication awaits independent controller review without self-acceptance
