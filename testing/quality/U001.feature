Feature: A validator that rejects the native-run approval packets an independent review would reject
  Tooling item U001 (zero credit, kind unblock; the publisher scope testing\quality is authorized for U001 only)
  Local, synthetic, offline: Node built-ins only, no network, no packages, no wall clock inside the pure functions (the date is injected)
  The accepted fixture is a trimmed copy of the refreshed packet JSON with placeholders only; the old 82 KB packet is never committed

  Scenario: The refreshed packet is accepted
    Given the accepted fixture and an injected date within 7 days of the price date
    When I call validatePacket(packet, { nowUtc })
    Then ok is true and the findings list is empty
    And the CLI node testing\quality\validate-packet.cjs <packet.json> prints OK and exits 0

  Scenario: A missing price is never costed as zero and never dropped from a total
    Given a returned price line turned into zero, negative, null or missing its currency, unit or effective date
    When I validate the packet
    Then a PRICE_* finding names the line
    And an unavailable price that is costed as 0, an unpriced item that enters a total, or a resource whose price is unavailable but sits in a total is rejected
    And a no-charge claim such as "no charge expected" without the price unavailable wording and a source is rejected

  Scenario: Exactly three bounded options whose figures recompute
    Given the three options of the fixture
    When any of OS, SKU, instance count or cap, region list, per-hour, monthly, expected plan cost (with the scale step), expected run, deadline, latency hour, worst case, ceiling or cents is broken
    Then an OPTION_* finding names the field
    And a ceiling below the worst case that includes the teardown-latency hour fails, as does a ceiling that is not ceil(worst x 1.25 / 5) x 5
    And a ceiling not labelled "planning bound, not enforced by Azure" fails

  Scenario: Every destructive step carries the three guards
    Given the cleanup and rollback plan of the fixture
    When a delete step loses the subscription pin, the ownership check or the pre-creation gate, or an az command loses --subscription
    Then a GUARD_*, ARMING_*, DELETE_*, AZ_NO_SUBSCRIPTION or SCRIPT_* finding is reported
    And the automatic backstop must delete first and the slot-swap rollback must give exact commands with --action preview and --action reset

  Scenario: Every owner decision defaults to no and no approval is claimed
    Given the seven decisions target, iacGeneration, scaffold, identityRegistration, deployment, expenditure and liveExecution
    When one default is yes, an answer-sheet value is yes, an approval flag is true or the subscription is not a placeholder
    Then a DECISION_*, ANSWER_*, APPROVAL_* or PLACEHOLDER_* finding is reported

  Scenario: No identifier or secret appears anywhere
    Given a GUID-shaped value, an e-mail address or a secret-shaped string in any field or in the markdown
    When I validate the packet
    Then GUID_FOUND, EMAIL_FOUND or SECRET_SHAPED is reported, except for a GUID in pricing.lines[].meterId

  Scenario: The packet states HEAD, the quota status and a current price date
    Given the repository state, the quota statuses and the price date
    When the state section, a quota status, the arming quota gate or a current price date is missing, the default region has a failed quota status, or the prices are older than 7 days
    Then a REPO_*, QUOTA_*, ARMING_NO_QUOTA_GATE, PRICE_DATE_* or PRICE_STALE_NOW finding is reported

  Scenario: The integrity hash and the markdown copy are checked
    Given the packet SHA-256 and an optional markdown copy
    When any field changes without a new hash, or the markdown lacks the hash, a ceiling or the HEAD section
    Then INTEGRITY_MISMATCH or a MARKDOWN_* finding is reported

  Scenario: The CLI has three exit codes
    Given node testing\quality\validate-packet.cjs <packet.json>
    Then exit 0 means ok, exit 1 means findings (each printed as CODE path: message) and exit 2 means usage or unreadable input

  Scenario: The first packet, rejected by the independent review, is rejected by the validator
    Given a packet built like revision 1: unguarded destructive steps, no teardown-latency hour, a resource-group row saying no charge expected and no quota status
    When I validate it
    Then at least DELETE_UNGUARDED, OPTION_LATENCY_MISSING, ZERO_COST_UNSOURCED and QUOTA_STATUS_MISSING are reported

  Scenario: The README states what a validator cannot prove
    Given the README
    Then it lists the exact commands for the tests, the RED replay and the per-file coverage, and says that prices and Learn facts need an independent lookup
