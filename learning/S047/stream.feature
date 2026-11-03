Feature: Application continuation after a synthetic gRPC stream cutover
  As a learner conducting A-S047 in packet SC-S047
  I compare native-shaped gRPC receipts with browser-proxy observations
  without treating ordinary HTTP, a proxy result, or this rehearsal as native proof.

  Background:
    Given the visible label "Training rehearsal - synthetic data - not a live Azure result"
    And eight fixed synthetic results numbered 1 through 8
    And each emitted result costs 10 synthetic milliseconds on the original clock
    And no server, account, network service, Azure resource, or credential is used

  Scenario: Continue from the application acknowledgement on a new stream
    Given v1 acknowledges result 3 and the original completion budget is 200 milliseconds
    And the continuation policy is checkpoint with a 40 millisecond resume delay
    And the native-shaped receipt is HTTP/2 application/grpc with grpc-status 0
    And the browser-proxy observation is complete
    When I start v1, cut over, resume on v2, and check the result
    Then continuation requests result 4 on a different synthetic stream
    And the original stream is explicitly reported as not preserved
    And both observations contain results 1 through 8 exactly once in order
    And elapsed time is 120 milliseconds on the original clock
    And the verdict is PASS for synthetic assertions only

  Scenario Outline: Unsafe application continuation remains a failure
    Given the continuation policy is <policy>
    When I complete the synthetic attempt
    Then the verdict is FAIL
    And <problem> remains explicit in the retained receipt

    Examples:
      | policy  | problem                 |
      | restart | duplicated results      |
      | skip    | dropped result 4        |
      | none    | missing results 4 to 8  |

  Scenario: HTTP success does not qualify gRPC continuation
    Given the native-shaped receipt is ordinary HTTP/1.1 application/json with status 200
    And the browser-proxy observation contains all eight results
    When I complete the synthetic attempt
    Then the proxy verdict is PASS
    But the native verdict and overall verdict are UNSUPPORTED
    And neither HTTP success nor browser success is called gRPC streaming proof

  Scenario: A nonzero gRPC status fails despite HTTP 200 and proxy success
    Given the native-shaped receipt has HTTP status 200 and grpc-status 14
    When I complete the synthetic attempt
    Then the proxy verdict is PASS
    But the native verdict and overall verdict are FAIL
    And grpc-status 14 remains visible

  Scenario Outline: Missing evidence is not borrowed from the other observer
    Given <evidence> is missing
    When I complete the synthetic attempt
    Then the verdict is UNKNOWN
    And unknown observations are distinct from counted dropped results

    Examples:
      | evidence        |
      | native receipts |
      | gRPC trailers   |
      | proxy receipts  |

  Scenario Outline: Browser-proxy defects are checked independently
    Given the native-shaped receipt contains all eight results exactly once
    And the proxy observation has <defect>
    When I complete the synthetic attempt
    Then the native verdict is PASS
    But the proxy verdict and overall verdict are FAIL
    And the exact missing or duplicated sequence is reported

    Examples:
      | defect              |
      | the last result lost |
      | a repeated result 4  |

  Scenario: Known failures take precedence over missing evidence
    Given native receipts are missing and the proxy repeats result 4
    When I complete the synthetic attempt
    Then the overall verdict is FAIL
    And the native verdict remains UNKNOWN rather than a fabricated pass

  Scenario: The original inclusive budget is never restarted at cutover
    Given the original budget is 120 milliseconds
    When I complete the default attempt in 120 milliseconds
    Then the deadline check is PASS
    When I reset and repeat with a 119 millisecond original budget
    Then the deadline check and overall verdict are FAIL
    And failures remain in history

  Scenario: Strict input and action guards prevent changing an admitted attempt
    Given the lesson is ready
    When I supply empty, fractional, nonfinite, out-of-range, extra, or unknown inputs
    Then the attempt is not started and an explicit input error is shown
    When I start a valid attempt
    Then its input snapshot is immutable and controls are locked
    And out-of-order and repeated actions fail without changing receipts or history

  Scenario: Reset is keyboard accessible and retains bounded honest history
    Given a failed checked attempt and an unfinished attempt
    When I activate Reset using the keyboard
    Then exact defaults and focus on the acknowledgement control are restored
    And the checked failure is retained
    And the unfinished attempt is retained as UNKNOWN, not silently completed
    And only the eight newest full receipts are retained in page memory
    And repeated reset does not add fictitious attempts

  Scenario: The portable page is isolated and verification does not overwrite proof
    Given an isolated headless browser using the published helper
    When I exercise the DOM, keyboard, errors, failure cases, and reset
    Then inline scripts, dynamic evaluation, and connections are blocked by CSP
    And no management or external network request occurs
    And the isolated session is closed in an awaited finally block
    And ordinary verification leaves previously captured evidence byte-for-byte intact
    And browser proof is written only with deliberate CAPTURE_BROWSER_EVIDENCE=1
