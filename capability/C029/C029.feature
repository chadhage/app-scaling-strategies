Feature: Evaluate original local journey latency and state without retry laundering
  Training rehearsal - synthetic data - not a live Azure result
  Original C029 D / P0 / H001, parents H001 H006 H012
  Independently Done gates C020 C023 C033; IaC N/A

  Scenario: A positive retry cannot repair an original budget failure
    Given an unchanged C033 two-read control with its original 1000 ms deadline
    When the first original completes at 1000.25 ms and a later original at 0.25 ms
    Then the first original remains FAIL and both originals remain in the denominator
    And the aggregate decision is FAIL, not HTTP-200 health or replacement success

  Scenario Outline: Apply the actual strict original deadline contract
    Given a closed synthetic clock control, not a measured browser or HTTP journey
    When its terminal elapsed time is <elapsed> ms under the C033 1000 ms budget
    Then its local latency verdict is <verdict>
    Examples:
      | elapsed | verdict |
      | 999.75  | PASS    |
      | 1000    | FAIL    |
      | 1000.25 | FAIL    |

  Scenario: Inspect the exact accepted historical observations
    Given the unchanged C034 decoder and exact saved C033 raw DOM and summary
    When I inspect the closed history
    Then original 3 retains its original 1118.9000000953674 ms budget miss
    And original 4 remains failed, originals 5 and 6 remain interrupted unknown
    And original 7 remains summary-only unverified, not a replacement success
    And exact original IDs, timing, order, business state and v1-v2 stamps remain visible

  Scenario: Held time does not stop the original budget
    Given C033 before-first holds zero requests and between-read holds one acknowledgment
    When an original is held beyond its deadline
    Then the original latency violation cannot be erased by resume
    And a partial snapshot does not invent a v2 reply, terminal or end time

  Scenario: Evaluate effects only as the accepted C023 pure event-log model
    Given C023 assumes an atomic local application and deduplication pair
    When an interrupted original is resumed or hypothetically reconciled
    Then its original incomplete or unknown state outcome remains visible
    And known effects, checkpoints, unknowns and retries remain distinct
    And no durable store, queue, external effect or latency observation is invented

  Scenario: Inspection input cannot supply authority
    Given bounded own-field finite JSON and the internally selected saved source
    When provenance, history, order, timing, state, stamps or a claimed verdict changes
    Then inspection rejects without adopting eligible, source, hash, approval or success
    And missing required observations stay UNKNOWN with a HOLD decision

  Scenario: Static keyboard inspection, comparison, errors and reset
    Given a static UI with the exact training banner and explicit source provenance
    When I use Tab, Enter and Space to inspect, compare a retry, reject JSON and reset
    Then budget failures and unknown originals remain visible in retained bounded history
    And reset changes only presentation and returns focus
    And CSP blocks inline scripts and connections
    And browser verifier PASS means UI verification, not user journey success

  Scenario: Verification is read-only and publication is scoped
    Given unchanged accepted source pins with distinct raw, CRLF-to-LF and Git hashes
    When normal Node or signed Edge verification runs
    Then source and saved evidence bytes do not change
    And only exact CAPTURE_BROWSER_EVIDENCE=1 appends deliberate unique own evidence
    And current publication authorization is separate from immutable historical proof
    And only the parent can accept one original D with zero extra credits
