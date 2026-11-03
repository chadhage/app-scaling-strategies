Feature: S076 synthetic consumer scale-in with an accounted-for claimed job
  Exact source: S076 Consumer scale-in, D-S076, A-S076, packet SC-S076.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given two synthetic consumers and one four-unit job claimed by consumer-A
    And consumer-B is available but cannot claim work still owned by A
    And logical time, leases, original work deadlines and shutdown grace are bounded
    And each attempt retains its observations, failures and unknown outcomes

  Scenario: Finish while the original claim remains valid
    When the operator closes admission to consumer-A
    And A finishes all four units before lease expiry and within the original work budget
    And the operator retires A within the declared shutdown grace
    Then one job and one effect are observed with one remaining consumer
    And the verifier reports PASS separately from synthetic cleanup

  Scenario: Renew is a continuation mechanism, not permission to stop an active owner
    Given a two-tick lease
    When the operator renews before each necessary expiry while A finishes the job
    Then the observed lease extends but neither original deadline nor shutdown grace moves
    And retirement is blocked while A still holds unfinished work
    And only observed completion followed by observed retirement can pass

  Scenario: Release requires an acknowledged current checkpoint and exclusive handoff
    When A saves its current progress and observably releases ownership
    And the operator retires A and grants the released job to B at epoch two
    Then B resumes from that exact checkpoint under a new bounded lease
    And retirement alone is UNKNOWN until the original job finishes exactly once
    And B still uses the original work deadline

  Scenario Outline: Missing proof cannot become a successful retirement
    Given the "<condition>" synthetic observation condition
    When the operator attempts the corresponding checkpoint, release, finish or retirement
    Then missing observations are UNKNOWN rather than invented completion or ownership
    And a blocked action cannot activate B or discard the claimed job
    Examples:
      | condition          |
      | checkpoint-missing |
      | ownership-unknown  |
      | completion-unknown |
      | retirement-unknown |

  Scenario Outline: Known contract failures remain failures
    Given the operator encounters "<failure>"
    Then the verifier reports FAIL and retains the original one-job denominator
    And later checks, ticks and resets do not erase the failed attempt
    And failure takes precedence over separate unavailable retirement proof
    Examples:
      | failure                                      |
      | expiry without a valid renewal               |
      | denied renewal followed by expiry            |
      | unfinished work beyond its original deadline |
      | retirement outside shutdown grace            |
      | confirmed abrupt stop while A holds work     |

  Scenario: Strict inputs and action order cannot forge successful work
    Given exact supported enums and bounded integer inputs are required
    Then coercible strings, booleans, fractions, non-finite numbers and extra fields are rejected
    And fabricated or mutated state, unexpected payloads and unsupported actions are rejected
    And invalid sequencing is visibly blocked without changing work or authority
    And successful observations never authorize a second business effect

  Scenario: Reset restores defaults without silently deleting negative evidence
    When the operator resets a nonempty attempt
    Then its complete bounded trace and outcome remain in an immutable in-memory archive
    And the new attempt restores the exact defaults with fault consent cleared
    And the fifth archive request is blocked instead of evicting earlier evidence
    And an explicit page reload is the documented way to clear the session

  Scenario: Actual browser conducting remains local and keyboard operable
    Then native labeled controls, Enter, Space, Tab, Shift+Tab and visible focus work
    And invalid inputs display an alert without a stale current PASS
    And reset does not shadow the native form reset method
    And the exact synthetic banner remains visible
    And enforced CSP blocks inline scripts, connections, frames, forms and workers
    And normal verification never rewrites retained proof
