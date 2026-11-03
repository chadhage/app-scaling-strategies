Feature: S044 original-artifact range resumption
  A-S044 is one frozen satisfier in packet SC-S044, parent D-S044.
  Source README S044 requires completion or correct range-based resumption
  within the original accepted user-experience budget.
  This portable rehearsal does not complete B-S044 or D-S044.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And a fixed synthetic artifact containing byte values 0 through 31
    And original admission at 0 ms, retained prefix at 30 ms, and cutover at 40 ms
    And a bounded original budget, retained prefix, response condition, and resume delay
    And no network, server, credentials, persistent storage, framework, or cloud resource

  Scenario: Resume the same artifact at its first missing byte
    Given 12 retained bytes, a correct 206 response, 10 ms delay, and a 100 ms original budget
    When I admit the prefix and resume after cutover
    Then the synthetic request is "bytes=12-" with the original artifact validator
    And each original byte is present exactly once in order
    And the assembled 32 bytes have the original SHA-256 digest
    And completion at 70 ms passes the original 100 ms budget
    And the verifier is PASS with one synthetic success and no failures or unknowns

  Scenario Outline: Successful responses cannot hide byte-integrity failures
    Given a synthetic 206 response with <condition>
    When I resume and verify the assembled artifact
    Then the verifier is FAIL and the synthetic journey is interrupted
    And the trace exposes <evidence> despite a successful response

    Examples:
      | condition             | evidence                                 |
      | a one-byte gap        | missing offset and shorter assembled file |
      | a one-byte overlap    | duplicate offset and longer assembled file |
      | one changed byte      | equal byte count but different SHA-256    |

  Scenario: The destination ignores the Range request
    Given a successful 200 response containing the full artifact instead of a range
    When I resume
    Then unsafe append is refused
    And unsupported range resumption is an explicit FAIL, not successful completion
    And the retained prefix is not misrepresented as a completed artifact

  Scenario: Retry timing cannot replace the original journey clock
    Given a correct range and 40 ms delay with a 100 ms original budget
    When I resume
    Then exact-deadline completion at 100 ms passes
    When a new run instead uses 41 ms delay
    Then completion at 101 ms fails even though the resumed transfer takes only 20 ms

  Scenario: Missing final checksum evidence cannot establish success
    Given a correct range but deliberately withheld final checksum evidence
    When I resume
    Then content-hash verification is unknown
    And the verifier is UNKNOWN with one unknown journey and no successes
    But a known gap or budget breach still yields FAIL when checksum evidence is missing

  Scenario: Inputs and state transitions are guarded
    Given exact supported response and checksum enumerations
    And integer prefix bytes from 4 through 28, delay from 0 through 1000 ms, and budget from 1 through 1000 ms
    Then strings, empty values, fractions, non-finite numbers, null, booleans, and extra fields are rejected
    And resume before admission, repeated admission, repeated resume, and reset while verifying are rejected
    And callers cannot mutate private active state or history through returned snapshots
    And a checksum execution error becomes explicit UNKNOWN rather than stale PASS

  Scenario: Reset restores controls without erasing failures
    Given a completed failed run followed by a completed successful run
    When I activate Reset rehearsal using the keyboard
    Then the exact defaults, idle state, and focus on the prefix control are restored
    And both earlier outcomes remain in the visible session history
    And history retains at most the eight newest outcomes with monotonic run identifiers
    And resetting an admitted but unfinished prefix records an UNKNOWN cancellation
    And reloading the document clears this explicitly session-only memory

  Scenario: Real browser checks exercise the actual DOM and CSP
    When I use only keyboard controls to admit, resume, and reset
    Then the DOM exposes the measured bytes, hash, budget, outcome, and retained trace
    And an invalid numeric control cannot display a prior successful result as current
    And a forged response selection is rejected without changing active state
    And inline script execution and external connection attempts are blocked by CSP
    And there are no unexpected page errors or external HTTP requests
    And no control named or identified "reset" shadows a form reset method

  Scenario: Verification preserves recorded proof
    Given the published isolated browser helper with SHA-256 "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055"
    When normal focused checks run
    Then existing evidence files are not rewritten
    And only deliberate "CAPTURE_BROWSER_EVIDENCE=1" captures browser proof
    And actual browser checks use openIsolatedLesson and await close in finally
    And raw pre-implementation output and non-discoverable RED snapshots remain preserved
