Feature: S108 valid candidate traffic and WAF/policy differences
  Policy, rule, traffic, asset, routing and authentication observations are fixed
  fictional teaching DATA ONLY. No WAF, network, resource or denial is changed.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given one fictional candidate route and three benign requests
    And the profile journey requires its HTML, API response and script asset
    And at most four comparisons and sixteen action records are permitted

  Scenario: Apply and inspect a mismatched policy that blocks a valid journey
    When the operator applies the journey-block fixture
    Then the policy label changes but the result stays unknown until inspection
    When the operator inspects the authored request observations
    Then the valid API request has a fictional 403 and rule POLICY-API
    And one attempted journey is interrupted despite a successful HTML request

  Scenario: A blocked asset also interrupts the complete valid journey
    When the operator applies and inspects the asset-block fixture
    Then the HTML and API observations are 200
    But the required script asset has a fictional 403 and rule POLICY-ASSET
    And the journey result is negative, not an uninterrupted transition

  Scenario: A complete matched observation is a positive local comparison
    When the operator applies and inspects the matched fixture
    Then all three required requests are allowed
    And the measured synthetic journey result is positive

  Scenario: Missing observation is neither an allow nor a proven block
    When the operator applies and inspects the missing-observation fixture
    Then the script observation and journey result are unknown
    And the unknown journey is excluded from the positive count

  Scenario: Restore the fixed baseline and verify rather than infer recovery
    Given an inspected comparison with a blocked request
    When the operator restores the baseline fixture
    Then recovery is still unknown and the original negative record remains
    When the operator measures complete recovery observations
    Then all three restored request observations are 200
    And recovery is positive while the original interruption remains counted

  Scenario Outline: Recovery can remain negative or unknown
    Given an inspected mismatched comparison
    And the recovery observation fixture is <fixture>
    When the operator restores and measures recovery
    Then recovery is <result> despite the baseline policy label
    And recovery is not proof of real policy propagation or native acceptance
    Examples:
      | fixture           | result   |
      | blocked-asset     | negative |
      | missing-asset     | unknown  |

  Scenario: Typed commands and canonical replay guard the entire state
    When a command has unknown keys, wrong types or an out-of-order action
    Or a state has forged counts, altered requests, sparse history or extra keys
    Then the command is rejected without mutating the previous state
    And denial is not bypassed, retried against a real endpoint or hidden

  Scenario: Bounded keyboard, error and reset operation
    Given the standalone browser page with its exact synthetic banner
    When the operator uses labelled controls with Tab, arrows and Enter
    Then apply, inspection, restoration and recovery work with visible focus
    And invalid form data produces a visible accessible error without a run
    And four completed comparisons disable a fifth until explicit reset
    And reset clears in-memory history, errors and observations with focus restored
    And restrictive CSP rejects inline scripts, eval and remote connections
    And normal verification cannot overwrite captured evidence
