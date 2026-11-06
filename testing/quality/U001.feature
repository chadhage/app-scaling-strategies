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

  # Revision 3: hardening after the second independent review (findings V1 to V14). The older scenarios above stay as they are.

  Scenario: Dates are strict ISO, real calendar dates, bounded on both sides by an injected clock (V1)
    Given pricing.pricingDateUtc (YYYY-MM-DD) and preparedAtUtc (YYYY-MM-DDTHH:MM:SSZ or an offset) and an injected nowUtc in ISO form
    When a date is 2026-13-45, 2026-02-30, 0000-00-00, a locale spelling, empty, in 2099, after now plus a 5 minute skew, after the packet date, or the clock itself is not ISO
    Then PRICE_DATE_INVALID, PREPARED_DATE_INVALID, PRICE_DATE_FUTURE, PRICE_AFTER_PREPARED, PREPARED_IN_FUTURE or NOW_INVALID is reported and the CLI refuses a non-ISO --now with exit 2
    And a price exactly 7 days old is accepted while 8 days is stale

  Scenario: Identifiers are searched in keys and values after normalisation (V2, V9)
    Given a GUID as 32 hex digits, with braces, urn:uuid:, upper case, split by newline, emphasis, spaces, dots, underscores or zero-width and non-breaking characters, glued to letters, or used as a JSON key
    And an e-mail written with [at], (at), full-width at, words, percent or entity encoding, spaces around the at sign, an IDN domain or without a top-level domain
    And a secret written as NAME_SECRET=value, an Entra client secret, an sk-proj key, a long run inside a URL, or split across array elements
    Then GUID_FOUND, EMAIL_FOUND or SECRET_SHAPED is reported at the key or value path, and the only GUID-shaped values allowed are the catalog meter IDs in pricing.lines[].meterId (METER_ID_UNKNOWN otherwise)
    And the README lists the covered spellings and the uncovered ones

  Scenario: A priced row needs a positive price and every zero-shaped spelling fails (V3)
    Given a required resource, an exclusion or a price register line
    When a priced resource lacks a positive priced line, an exclusion lacks its cost, or any of free, no charge, n/a, included, 0 USD, empty or non-breaking-space variants stands for a cost
    Then PRICE_NOT_POSITIVE, RESOURCE_PRICING_STATUS or ZERO_COST_UNSOURCED is reported

  Scenario: Every command of every field is parsed, and every delete is guarded and names the guarded target (V4, V10, A4, A5)
    Given every string of the packet, the plan sections and the unattended script, parsed by a quote-aware tokenizer
    When a delete names another resource group or subscription, sits in commands given as a string, a field named cmds, a why text, a how field, a risk, a backstop text or the markdown, uses az.cmd, a pipeline or && chain, a continuation, Remove-AzResourceGroup, a REST delete, a complete-mode deployment, a variable verb, or has its guards after it
    Then DELETE_UNGUARDED, DELETE_TARGET, DELETE_OUTSIDE_COMMANDS, AZ_NO_SUBSCRIPTION, AZ_COMMAND_NOT_ALLOWED, COMMAND_FORBIDDEN, COMMAND_DYNAMIC or PLAN_SHAPE is reported
    And every az command carries its own --subscription with the approved placeholder, never empty
    And the unattended script wraps every delete, never stops at the first failure, ends with the guarded group delete, records failures, exits non-zero and writes a persistent alarm file

  Scenario: The worst case is recomputed from the caps and the unit prices (V5)
    Given usageCaps, the register and the three options
    When a cap is raised, a usage line is dropped or understated, an option SKU has no register line, or a price is divided by 100
    Then OPTION_USAGE_CAPS, OPTION_USAGE_LINES, OPTION_USAGE_QUANTITY, OPTION_PRICE_LINE_MISSING, OPTION_WORST_TOTAL, OPTION_CEILING_BELOW_WORST or OPTION_CEILING_RULE is reported on the recomputed worst case

  Scenario: Hostile input is bounded (V6, V7)
    Given 200 KB and 5 MB adversarial tokens and JSON nested 5000 deep
    Then validatePacket answers INPUT_TOO_LARGE or INPUT_TOO_DEEP in well under a second, never throws, and the CLI prints one line and exits non-zero without a stack trace

  Scenario: The markdown copy says what the JSON says (V8)
    Given the JSON of the packet and its markdown
    When the markdown lacks a heading, a ceiling next to its option name, the default option and region, a quota status, the price expiry, the allowance or approvals sentence or the hash, carries a dollar amount the JSON does not contain, or carries a command or identifier the JSON does not
    Then a MARKDOWN_* finding is reported

  Scenario: The README states what a validator cannot prove
    Given the README
    Then it lists the exact commands for the tests, the RED replay and the per-file coverage, and says that prices and Learn facts need an independent lookup
