Feature: S019 cell-based expansion with a synchronized, fenced tenant handoff
  # A-S019; D-S019; SC-S019; one frozen S unit; synthetic-only.
  # README S019: Add an isolated application cell and migrate selected tenants
  # through controlled state and routing handoff.
  Background:
    Given cell A has two ready synthetic workers and owns tenants alpha and beta
    And tenant alpha has acknowledged writes 1 and 2, and beta has write 1
    And cell B does not exist, and no migrated journey has been observed
    And every result says "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: Added capacity is distinct from a copied tenant or a new route
    When the operator creates cell B
    Then B has two distinct synthetic workers and an isolated empty data store
    And allocated synthetic capacity increases from 100 to 200 requests per second
    And both tenants still route to and are exclusively owned by A
    And no migration success is claimed

  Scenario: Stale copies and premature routing are blocked without disrupting A
    Given the operator has created B and synchronized the selected tenant
    When A acknowledges another write for the selected tenant
    Then the copy in B is stale
    And ownership transfer and routing are blocked
    When the operator synchronizes again
    And atomically fences A's writer and assigns exclusive epoch-2 ownership to B
    And changes only the selected tenant's route to B
    And exercises the old epoch-1 writer
    And runs both tenant journeys
    Then the old writer is rejected without an additional acknowledged write
    And B contains every acknowledged selected-tenant write in order
    And the other tenant remains usable and owned by A
    And the measured synthetic result is success

  Scenario Outline: Failed and missing observations are not hidden by recovery
    Given the selected tenant has a synchronized exclusive handoff and routes to B
    When the operator selects <condition> and runs both tenant journeys
    Then the selected tenant is measured as <classification>
    And the unaffected tenant succeeds in A
    When the operator restores healthy observations and runs both journeys
    Then the earlier <classification> remains in the ledger and cumulative result
    Examples:
      | condition   | classification |
      | unready     | failure        |
      | wrong-state | failure        |
      | unknown     | unknown        |

  Scenario: A deliberate ownership-to-routing gap exposes a real synthetic failure
    Given B exclusively owns the selected tenant but its route still names A
    When the operator runs both tenant journeys
    Then A rejects the selected tenant's stale route with HTTP 409
    And the unaffected tenant succeeds
    And later routing recovery does not erase the failure

  Scenario: Strict guards and bounded reset preserve useful evidence
    Given a run is limited to 48 actions and 8 two-tenant journey batches
    When an unknown command, malformed state, or invalid selection is supplied
    Then the command is rejected without mutating run data or proof
    When the operator archives and resets using the keyboard
    Then the source-only run returns and its result is unknown
    And at most four prior run summaries and full traces remain in page memory
    And native form reset remains callable

  Scenario: The actual browser enforces the offline boundary
    Given all lesson assets are local, with no framework or network dependency
    Then labels, focus, errors, traces and reset work in the actual isolated browser
    And inline script execution and external connections are blocked by CSP
    And every browser session is closed in an awaited finally
    And ordinary verification leaves historical evidence bytes unchanged
