Feature: K-C001 repays the C001 probe.cjs coverage debt with behavioral tests of the fail-closed command line
  K-C001 / worker-K-C001 serves C001 [D]
  Zero credit; adds tests, one fixture, one spec, one README and evidence only; no production source, sealed evidence, retained RED or existing test is edited
  The new tests never read the real ledger: the exported function gets an injected reader and the command line runs against a private in-memory ledger

  Scenario: The accepted C001 tests never call the failure handler of the probe command line
    Given the L-0004 coverage command over capability\C001\probe.cjs with the accepted C001 tests
    When it runs with the 85 percent line, branch and function thresholds
    Then it exits 1 with 95.74 percent lines, 100 percent branches and 75 percent functions
    And the one uncalled function is the catch callback at the end of the top-level async function of probe.cjs

  Scenario: Any failure while deciding or reporting fails closed with one constant message
    Given the real probe.cjs runs as a child process with a private ledger and a collaborator fault: the guard rejects, throws, answers nothing, or answers a decision that cannot be serialized
    When the command line runs one action
    Then the exit code is 1 and no decision reaches standard output
    And standard error holds exactly one JSON line: allowed false, executed false and the single reason PROBE_FAILURE with the constant message
    And the message of the underlying error never reaches the visitor

  Scenario: A decision that was allowed but cannot be reported is never reported as allowed
    Given the private ledger holds the approved consent record and the same action exits 0 without a fault
    When the decision cannot be serialized or standard output cannot be written
    Then the exit code is 1 and no decision reaches standard output

  Scenario: The command line asks for the ledger at one fixed place and denies on every ledger defect
    Given the real probe.cjs runs as a child process whose reads of .docs\wiki\flow-state.json are served from a private ledger
    When the ledger holds the approved record, a drifted record, no approval, an unusable shape, invalid JSON or is unreadable
    Then local.summary and local.probe exit 0 only for the approved record, with executed false and zero limits
    And every other ledger answer exits 1 with its own reason code and the guard reasons after it
    And a restricted action is denied with its own reason code even when the ledger is approved

  Scenario: Anything but exactly one action argument is denied first with INVALID_ARGUMENTS
    Given the private ledger holds the approved consent record
    When the real probe.cjs runs with no action or with more than one argument
    Then the exit code is 1, the action is null and INVALID_ARGUMENTS comes before the guard reasons
    And requiring probe.cjs as a module runs no command line and exposes only evaluateCurrentApproval

  Scenario: The exported function reads the injected source once and reports source failures first
    Given evaluateCurrentApproval is called with an injected reader
    When the reader returns text, throws, returns a non-string or returns hostile shapes such as an approval nested under __proto__
    Then the reader is called once with no arguments
    And a source failure puts SOURCE_UNAVAILABLE or SOURCE_INVALID_JSON before the guard reasons in a frozen answer that never echoes the thrown message
    And an inherited, array or primitive approval is never authority
