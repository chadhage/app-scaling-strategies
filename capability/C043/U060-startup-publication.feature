@U060 @C043 @tooling-only @startup @parallel
Feature: Publish complete startup identity facts before any reader can observe them
  Parent full480 review failures and all D1-D10 bytes stay immutable.
  Private diagnostics reproduced the three file-level failures by pausing a
  real worker-start publication after creation and observing the child's empty
  read. Those SyntaxErrors are diagnostics, not the behavioral assertion RED.

  Scenario Outline: An identity fact is never visible while its bytes are incomplete
    Given the actual retained <publisher> implementation
    And an injected filesystem observer between file creation and payload completion
    When the identity fact is published
    Then the final fact path is absent until its complete JSON is available
    And the old direct-final-path write fails this named behavioral assertion
    And this assertion RED is archived before the publication repair

    Examples:
      | publisher        |
      | coordinator-start|
      | worker-start     |
      | worker-ready     |

  Scenario: Two startup publishers do not overwrite each other's facts
    Given two caller-owned startup namespaces and an unrelated fact
    When publications and FIFO or LIFO cleanup interleave
    Then each reader observes only its complete PID/token fact
    And a duplicate final fact is refused without replacing the original
    And failed publication removes only its own pending file
    And the unrelated fact remains byte-identical

  Scenario: Startup failures cannot be counted as named mutation evidence
    When a child reports only a test-file failure
    Then it is undecided even if a partial output contains an assertion
    And controls and equivalents retain complete underlying child diagnostics
    And the original79 mutations and2 equivalents are unchanged
    And the complete269 generated positions remain mandatory
    And exact full480/current/full LF/full CRLF gates run after the last edit
