Feature: S014 scheduled capacity is observed ready before known demand
  Training rehearsal - synthetic data - not a live Azure result

  Source: README.md S014; backlog D-S014; portable A-S014 in SC-S014.
  One frozen satisfier, kanoUnit A-S014. P001 is an original native-parent
  prerequisite, not a prerequisite for this resource-free portable lesson.
  The synthetic schedule fixture does not establish native schedule support.

  Background:
    Given two initially ready units, each supporting 40 requests per logical second
    And a 20-second known demand window starts at logical second 30
    And the planned target is four units for demand of 120 requests per second
    And provisioning takes 8 seconds and warming takes 7 seconds
    And 10 synthetic complete journeys are sampled every 5 seconds in the window
    And each complete journey must finish correctly within 800 milliseconds
    And all observations are deterministic, in-memory, synthetic fixtures

  Scenario: Pre-provisioning and warming precede demand
    When I schedule demand with 20 seconds of lead time
    Then the calendar is accepted but two deployed units are still observed
    When I advance the logical clock through the declared window
    Then the scheduler is observed firing at second 10
    And four deployed units are observed at second 18
    And four ready and traffic-eligible units are observed at second 25
    And observed ready time 25 is strictly less than demand time 30
    And all 40 sampled journeys complete correctly within budget
    And checking the outcome passes only this synthetic attempt

  Scenario: A correct calendar is not timely capacity
    When I schedule the same demand with only 5 seconds of lead time
    And I observe the complete window and check the outcome
    Then the calendar and scheduler are correct
    But ready capacity first appears at second 40, after demand begins
    And the ready-before-demand assertion fails
    And capacity-shortfall interruptions remain in the denominator
    And the attempt is not reported successful

  Scenario: Ready at the boundary is not ready before demand
    When lead time exactly equals provisioning plus warming time
    And I observe the complete window and check the outcome
    Then client samples may succeed
    But readiness simultaneous with demand fails the strictly-before assertion

  Scenario Outline: An observed failure cannot be hidden by a schedule entry
    When I select the "<fixture>" fixture and schedule demand
    And I observe the complete window and check the outcome
    Then the outcome is failed
    And the trace explains "<reason>"
    And failed observations and individual client records are retained

    Examples:
      | fixture              | reason                       |
      | missed-trigger       | scheduler did not fire       |
      | provisioning-failure | additional units not deployed|
      | warmup-failure       | additional units not ready   |
      | slow-clients         | 800 ms journey budget exceeded|

  Scenario Outline: Missing evidence and unqualified support cannot pass
    When I select the "<fixture>" fixture and schedule demand
    And I observe all available data and check the outcome
    Then the outcome is "<outcome>", never passed
    And unknown clients remain in the sample denominator
    And missing observations are not replaced with planned timestamps

    Examples:
      | fixture              | outcome     |
      | missing-readiness    | unknown     |
      | missing-clients      | unknown     |
      | unsupported-schedule | unsupported |

  Scenario: An incomplete or empty observation window is not a success rate
    When I check an attempt before all four window samples exist
    Then no passing full-window outcome is claimed
    And an empty sample has a null success fraction, not 100 percent
    And the incomplete assessment remains visible after a later assessment

  Scenario: Invalid controls never change a running attempt
    Given an existing scheduled attempt
    When I submit empty, fractional, negative, nonfinite, or out-of-range values
    Or lead time places the trigger before logical second zero
    Or I try to replace an unfinished attempt
    Then the invalid action is announced and recorded
    And the existing configuration, clock, observations, and assessments are unchanged

  Scenario: Later success preserves earlier failures and unknowns
    Given a completed failed attempt and a completed unknown attempt
    When I conduct a new healthy attempt
    Then each earlier configuration, trace, client result, and assessment is unchanged
    And the complete record still reports each earlier non-success

  Scenario: Keyboard operation, reset, and restrictive browser policy
    Given I open index.html directly without a server or account
    Then the exact training banner is prominent
    And labeled native controls support Tab, Shift+Tab, Enter, and Space
    And results and invalid actions have live announcements
    When I activate Reset rehearsal using the keyboard
    Then form.reset remains callable and restores the default controls
    And only this lesson's in-memory attempts and observations are cleared
    And the reset button receives keyboard focus
    And local external scripts and styles work under the declared CSP
    But inline scripts, inline handlers, and network connections are blocked

  Scenario: Evidence remains honest and repeatable
    Then BDD precedes a loadable stub and genuine assertion RED
    And IaC is explicitly N/A after RED and before implementation
    And original RED and failed verification attempts are preserved
    And ordinary verification does not rewrite published browser proof
    And browser capture requires CAPTURE_BROWSER_EVIDENCE=1 deliberately
    And Node 22 is test tooling only; Node 24 and native proof remain unqualified
    And the isolated published helper is used with awaited finally cleanup
