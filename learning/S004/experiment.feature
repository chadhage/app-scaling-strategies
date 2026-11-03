@A-S004 @S004 @D-S004 @SC-S004 @synthetic
Feature: Hold stable A/B cohorts and deliberately converge the fixture
  Training rehearsal - synthetic data - not a live Azure result
  Twenty invented users have fixed buckets 2, 7, ... 97.
  Buckets below 50 belong to A/v1; the rest belong to B/v2.
  Every simulated round retries one ticket transaction per user.
  Both versions must read schema 1, preserve the same credits/tickets,
  and record exactly one effect for that transaction despite the retry.
  One round is one simulated minute, not a real observation window.
  IaC is explicitly N/A: this local bundle creates no resources.

  Scenario: Configuration is not an observation
    Given a new 50/50 rehearsal with stable intended cohorts
    Then configured desired traffic to v2 is 50 percent
    But no user has an observed version, state, or effect
    And user impact is unknown and migration is not complete
    When I request convergence without observing the experiment
    Then convergence is blocked and desired traffic remains 50 percent

  Scenario: A sustained healthy experiment is not a completed migration
    Given a new rehearsal
    When I hold 12 stable compatible rounds
    Then all twenty users keep their intended cohorts in every round
    And the synthetic observations contain ten users on v1 and ten on v2
    And both versions preserve equivalent canonical state and exactly-once effects
    And a passing experiment verifier does not claim all users migrated
    And migration remains not complete while the split is held

  Scenario: Compatible versions share an idempotency contract
    Given schema 1 with 1000 credits, zero tickets, and no transaction effects
    When the same ticket transaction is retried through v1 and v2
    Then only one credit is spent and one ticket is issued
    And the canonical state and effect key are readable by either version

  Scenario: Deliberate convergence needs a new actual synthetic observation
    Given three stable compatible split rounds have passed
    When I request convergence to v2
    Then desired traffic becomes 100 percent
    But the last observed destinations remain ten v1 and ten v2
    And the lesson marks those observations as predating the convergence request
    And convergence is unknown rather than inferred from the configured percentage
    When I observe one complete compatible convergence round
    Then all twenty fixture users are observed on v2 with compatible state and one effect
    And synthetic convergence passes without claiming native proof or real-user migration

  Scenario: Wrong per-request assignment is a visible failed experiment
    Given a new rehearsal
    When I hold three rounds with the deliberately unstable assignment
    Then some observations disagree with their stable intended cohort
    And a later returning assignment does not erase the earlier failed round
    And user impact is failed and convergence is blocked

  Scenario: An incompatible v2 state and retry path fails honestly
    Given a new rehearsal
    When I hold a round with the deliberately incompatible state path
    Then v2 writes schema 2 and applies the retried transaction twice
    And the observed state and effect counts fail the shared contract
    And the lesson reports failed users rather than successful migration
    When I record a later compatible round
    Then the earlier failure remains in history and cannot authorize convergence

  Scenario: Missing evidence stays unknown
    Given a new rehearsal
    When one synthetic user has no observation
    Then observed destination counts exclude that user
    And the row has no fabricated state or effect
    And user impact is unknown and convergence is blocked
    When a later complete round is recorded
    Then the earlier unknown outcome is still retained

  Scenario: A desired 100 percent route can still fail convergence
    Given a healthy observed split followed by a convergence request
    When the lagging-route fixture leaves one user observed on v1
    Then configured desired traffic remains 100 percent
    But actual synthetic observations show one v1 and nineteen v2
    And convergence and user impact are failed, not complete

  Scenario: Missing convergence evidence is not success
    Given a healthy observed split followed by a convergence request
    When the missing-observation fixture is recorded
    Then nineteen users are observed on v2 and one outcome is unknown
    And synthetic convergence remains unknown

  Scenario Outline: Invalid inputs preserve existing evidence
    Given a rehearsal with an observed split and an inspectable trace
    When I submit the invalid rounds or fixture input <input>
    Then I see a specific validation error without an uncaught exception
    And the rehearsal, observed rows, and prior trace are unchanged
    Examples:
      | input                           |
      | empty, zero, negative, or 13     |
      | fractional or nonnumeric rounds |
      | an unrecognized fixture         |
      | a request beyond 100 rounds     |

  Scenario: Keyboard operation and explicit Reset create a separate rehearsal
    Given a failed or unknown rehearsal in the reloaded actual browser
    When I activate Reset rehearsal using the keyboard
    Then the local form defaults and in-memory evidence are cleared
    And focus returns to the rounds input
    And no observed destinations or successful migration are manufactured
    When I hold a new compatible split using the keyboard
    Then the new rehearsal contains no prior failed or unknown rounds
    And Reset has performed no resource cleanup or management operation

  Scenario: Portable scope and safe presentation
    Then the exact synthetic training label is prominent
    And scripts and styles are local with a restrictive CSP and no network calls
    And no credentials or form controls named reset or submit are present
    And Node 22 is test tooling only
    And C001 design approval grants no cloud, IaC, identity registration, or spend
    And B-S004 and full D-S004 acceptance remain unverified
