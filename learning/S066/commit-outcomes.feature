Feature: Reconcile synthetic database failover during commit without applying an operation twice
  A-S066 / D-S066 / SC-S066 is one frozen S learning unit, not native database proof.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given three fixed synthetic operations each intend exactly one effect
    And the only fixtures are an authoritative commit receipt, a terminal abort receipt, and an uncertain receipt
    And an absent or unavailable lookup is never a terminal abort receipt
    And original operation keys and payloads are fixed, not learner supplied
    And at most six attempts are retained in memory until explicit reset

  Scenario: Lost acknowledgements cannot establish either commit or failure
    When the operator begins the three commits and injects failover before acknowledgements return
    Then all three client outcomes are unresolved
    And three interrupted commit responses remain in the fault record
    And no duplicate or successful transaction conclusion is invented

  Scenario: Authoritative reconciliation distinguishes all three original outcomes
    Given the uncertain receipt remains unavailable
    When the operator reconciles after the fault
    Then the original outcomes are one committed, one failed, and one unresolved
    And the failed operation has a terminal abort receipt rather than a missing lookup
    And the unresolved original effect count remains between zero and one

  Scenario: Safe retry holds uncertainty rather than guessing
    Given the uncertain receipt remains unavailable
    When the operator reuses the committed receipt and retries only the confirmed abort with its original key
    Then the recovered results are two committed, zero failed, and one unresolved
    And the total effect count is between two and three
    And the duplicate count is zero
    And the effect reconciliation gate is UNKNOWN, not PASS
    And the original failed outcome and three interrupted responses remain visible

  Scenario Outline: Resolved evidence permits bounded same-key recovery
    Given the uncertain receipt is authoritative "<receipt>"
    When the operator reconciles and retries only confirmed aborts with the original keys
    Then the recovered results are three committed, zero failed, and zero unresolved
    And exactly three effects exist with zero duplicates
    And the original failed count remains "<failed>"
    And the effect reconciliation gate is PASS without claiming uninterrupted user migration
    Examples:
      | receipt   | failed |
      | committed | 1      |
      | aborted   | 2      |

  Scenario: Blind retries using fresh keys duplicate a known committed effect
    Given the uncertain receipt remains unavailable
    When the operator retries every operation with a fresh key
    Then the recovered results are one committed, one failed, and one unresolved
    And the effect count is between four and five
    And known duplicates are one with a possible second duplicate
    And the effect reconciliation gate is FAIL even while an outcome remains unresolved

  Scenario: Holding a confirmed abort does not deliver its intended effect
    When the operator holds all operations after reconciliation
    Then the terminal abort remains a failed intended operation with zero effects
    And the effect reconciliation gate is FAIL rather than a no-duplicates success

  Scenario: Every bounded fixture and recovery combination is deterministic
    Given three uncertain-receipt fixtures and three recovery policies
    Then all nine combinations have explicit original and recovered attribution and effect bounds
    And no clock, random data, endpoint, credential, database, or management call is used

  Scenario: Inputs and state cannot be coerced or skipped
    Then extra, inherited, accessor, symbol, wrong-type, and invalid-enum inputs are rejected without mutation
    And getters are not invoked
    And skipped, repeated, out-of-order, argument-smuggled, and over-capacity actions are rejected
    And returned nested snapshots cannot mutate private state

  Scenario: A learning verifier is not a user-impact verdict
    Given a completed failed or unknown recovery
    When the learner correctly predicts its gate
    Then only the learning verifier passes
    And the failed or unresolved recovery and interrupted responses remain unchanged in retained history

  Scenario: Browser operation, explicit reset, and CSP are observable
    Then native controls work with keyboard focus and visible error messages
    And a new attempt retains the full previous proof without silently evicting history
    And reset clears proof, history, errors, locked controls, and predictions and restores defaults and focus
    And no control shadows the form reset method
    And actual browser probes reject inline script and external connections under enforced CSP
    And normal verification never rewrites retained proof
