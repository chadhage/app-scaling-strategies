Feature: Independent local lesson browser evidence
  UI checks must not compete for the VS Code integrated browser foreground.
  This is local test tooling, not production runtime or Azure evidence.

  Scenario: Two lessons remain independently actionable in parallel
    Given the explicitly pinned cached Playwright package and signed installed Microsoft Edge are available
    When two fixture lessons are opened concurrently in fresh headless browsers
    Then both documents report visibilityState "visible" without requesting foreground focus
    And real button and keyboard interactions change only their own input and counter
    And closing either session releases its browser without closing the other session
    And each session removes its own disposable runtime directory
    And repeated cleanup is safe

  Scenario: The offline browser choice is explicit
    Given Microsoft Edge is the selected Chromium browser channel
    When the helper launches a browser
    Then it uses headless mode with the Chromium sandbox enabled
    And it never falls back to another executable or the integrated browser
    And disposable profiles and artifacts stay in the repository private runtime

  Scenario Outline: Only approved local lesson paths can be opened
    Given approved roots learning, capability, and testing/browser/fixtures
    When a caller supplies "<path>"
    Then the helper rejects it with an explicit local-path validation error before launch

    Examples:
      | path                                      |
      | https://example.invalid/lesson            |
      | file:///C:/Windows/win.ini                 |
      | C:\Windows\win.ini                        |
      | ..\outside.html                           |
      | learning\..\README.md                     |
      | testing\browser\isolated.cjs               |
      | testing\browser\fixtures\..\isolated.cjs   |

  Scenario: Filesystem links cannot escape approved roots
    Given a link inside the fixture root points outside every approved root
    When a caller opens a lesson through that link
    Then the helper rejects the resolved destination before launching a browser

  Scenario: A failed lesson load does not leak a browser
    Given a fresh headless browser has been launched for an approved local fixture
    When that fixture fails to navigate
    Then the helper closes its owned context and browser before rejecting
    And it removes its own disposable runtime even if context cleanup reports an error
