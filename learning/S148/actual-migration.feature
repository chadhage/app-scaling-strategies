Feature: Attribute intended migration to the same original synthetic journey
  A-S148 is the original P0 satisfier in LP-EXPORT, entered through SOURCE.
  All users, tiers, versions, identities, times, requests and traces are fixed
  fictional teaching data, never live Azure, network or user telemetry.

  Background:
    Given one fixed fictional transition and twelve original journeys
    And each original journey starts at 0 ms with a 2000 ms original budget
    And the declared transition lasts from 1000 ms to 1100 ms
    And frontend and API must move from blue v1 to green v2
    And the shared data tier is not required to move
    And the banner is "Training rehearsal - synthetic data - not a live Azure result."

  Scenario: Prove intended movement, not merely successful requests
    Given the original user, journey, attempt and correlation match at both required tiers
    And correctly timed origin and intended target stamps are observed
    When the operator selects, inspects and measures the fixed packet
    Then intended movement is observed for that same original journey
    And unchanged shared data does not prevent that movement
    And an uninterrupted correct completion within the original budget is a successful migration

  Scenario: Keep unchanged successful users out of migration success
    Given an original user completes correctly while frontend and API stay entirely on blue v1
    And all requests return HTTP 200 and all declared tier probes are healthy
    When the operator measures that packet
    Then the original journey is classified as unchanged
    And its successful completion is counted separately as an unchanged success
    And it contributes zero successful migrations

  Scenario Outline: Incomplete attribution remains unknown
    Given a packet has <missing evidence>
    When the operator measures that packet
    Then required intended movement remains unknown
    And requests, health and target-version-only observations cannot fill the gap
    And no successful migration is awarded
    Examples:
      | missing evidence                         |
      | no required origin trace                 |
      | a successful new attempt, not the original|
      | no required API target                   |
      | a mismatched correlation                 |
      | missing tier, deployment or version       |
      | missing or incorrectly typed timing       |

  Scenario: A known wrong target or partial required move is negative evidence
    Given a required tier is observed at a different target than declared
    When the operator measures that packet
    Then movement is contrary to the intended transition
    And a correct completion does not make it a successful migration

  Scenario: Movement is separate from whole stateful correctness and original timing
    Given the same original journey has observed intended version movement
    When its terminal response loses state, its original budget is exceeded, or interruption is observed
    Then version movement stays observed
    And the whole original outcome, interruption and original elapsed budget stay separate
    And it is not counted as an uninterrupted successful migration

  Scenario: Recovery cannot erase an interruption or unknown observation
    Given an original journey has an interruption or unknown observation before recovery
    When a later correct completion is observed
    Then the terminal completion may be successful
    But the prior interruption or uncertainty remains in the original outcome and history
    And the original budget is not restarted

  Scenario: Count original transitions, journeys and requests without inflation
    When the operator inspects and measures the entire fixed cohort
    Then there is one transition event, twelve original journeys and twenty-four HTTP 200 requests
    And movement counts are five observed, one unchanged, one contrary and five unknown
    And terminal completion counts are ten successful, one failed and one unknown
    And whole journey counts are seven uninterrupted, one failed, one interrupted, one over-budget and two unknown
    And there is exactly one successful migration and one unchanged successful journey
    And repeating inspection never creates additional original journeys or transition events

  Scenario: Typed, scoped, one-use inspection guards
    Given measurement requires a fresh inspection for the current selection
    Then only literal boolean true is an approved teaching confirmation
    And absent, string, numeric, boxed, stale, foreign and replayed confirmations are rejected
    And duplicate or replayed traces never become positive migration evidence
    And all operations and retained history have declared finite bounds

  Scenario: Keyboard, errors and reset preserve evidence
    Given the standalone page is opened directly without a server
    When the operator conducts it by keyboard
    Then selection, inspection, confirmation, measurement and reset are usable
    And errors are announced, focused and do not replace prior measured results
    And reset clears current selection, confirmation and results but retains bounded history
    And the reset control does not shadow the form reset method
    And CSP blocks inline scripts, inline handlers, network connections and form submission

  Scenario: Verification is read-only unless raw capture is deliberate
    When focused tests run without exact CAPTURE_BROWSER_EVIDENCE=1
    Then no source, evidence or history file is written
    When exact CAPTURE_BROWSER_EVIDENCE=1 is supplied
    Then actual isolated browser observations go to a unique owned raw evidence directory
    And the published helper is used with awaited close in finally
    And failed RED and raw browser failures are retained outside test autodiscovery
    And no native, production Node 24, source-parent or extra Kano completion is claimed
