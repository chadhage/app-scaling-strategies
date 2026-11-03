Feature: S054 database expand-migrate-contract, a portable synthetic rehearsal
  Exact source: README S054; backlog D-S054; A-S054; frozen S; packet SC-S054.
  Add compatible structures, migrate safely, and remove old structures only after
  dependent old consumers AND old work disappear. No native migration is proved.

  Background:
    Given four fixed synthetic labels and two new bridge readers
    And the old reader needs legacyLabel while the new reader prefers modernLabel
    And the new reader may fall back to legacyLabel only during the overlap
    And no concurrent writes, database, network, credentials or Azure resource exists
    And the banner is "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: Additive expansion and faithful migration preserve both reader contracts
    Given two old consumers and one old work item
    When I start and expand the data shape without dropping legacyLabel
    Then all eight observed old/new record reads pass
    When I faithfully migrate all four records
    Then all eight old/new record reads still pass
    And migration is not reported as completed contraction

  Scenario: Old consumers and work independently prevent contraction
    Given a completely observed faithful migration
    When I request contraction with two old consumers and one old work item
    Then contraction is blocked and legacyLabel is retained
    When I upgrade all old consumers
    Then the old work item still prevents contraction
    When I finish the old work item and request contraction
    Then legacyLabel is removed and all four new-reader reads pass
    And only this synthetic transition is reported complete

  Scenario: An old work item is a dependency even with no old consumers
    Given zero old consumers and two old work items
    When I expand and faithfully migrate
    Then contraction is blocked until both old work items finish

  Scenario: Sequencing is enforced rather than guessed from a healthy old reader
    When I request contraction before expansion or before migration
    Then contraction is blocked without removing or changing any data
    And a safe abort is not a completed migration

  Scenario: A copied but incorrect value is a visible failed journey
    Given complete observations and a corrupt-first-record migration
    When I migrate after expansion
    Then seven reads pass and one new-reader read fails
    And the synthetic user impact is interrupted
    And neither upgrading old consumers nor contraction can waive that failure

  Scenario Outline: Missing observations never manufacture migration proof
    Given zero old consumers and zero old work items
    And a <migration> migration with <observation> observations
    When I expand, migrate and request contraction
    Then the migration check is <gate>
    And contraction remains blocked
    And the exact observed, failed and unknown counts remain visible
    Examples:
      | migration     | observation | gate    |
      | faithful      | partial     | UNKNOWN |
      | corrupt-first | none        | UNKNOWN |
      | corrupt-first | partial     | FAIL    |

  Scenario: Strict inputs, immutable issued states and bounded retained history
    Then empty, fractional, out-of-range, nonnumeric or extra inputs are rejected
    And forged states and out-of-order actions cannot change the lesson
    And choices lock at start and cannot be changed through disabled DOM controls
    And each attempt retains at most twelve events without eviction
    And six attempts retain their configurations, checks, blocked gates and impacts
    And further attempts are refused until an explicit reset

  Scenario: Actual browser keyboard, reset, error and CSP checks
    When I use Enter, Space and Tab to conduct the lesson
    Then controls have visible focus, labels, live results and actionable errors
    And reset restores defaults, clears history, errors and measurements, and moves focus
    And inline scripts and outbound connections are blocked by enforced CSP
    And normal verification never rewrites saved proof
