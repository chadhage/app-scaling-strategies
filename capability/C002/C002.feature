Feature: C002 validates one explicit local run envelope without executing a run
  Kano D; parents H001, H003, H012; technical entry gate C001.
  C001's pinned approved-contract and contract-guard are the authority.
  Supplied comparison limits are local data, never Azure authorization or defaults.
  IaC is N/A: this slice creates no infrastructure or management calls.

  Scenario: Validate an explicitly bounded local envelope
    Given the explicit approval exactly matches C001's approved snapshot
    And an envelope and every comparison bound are explicitly supplied
    And the bounds are labelled local-comparison-only
    When the operator validates an in-range local.probe envelope
    Then a valid-local-envelope result contains the validated data and applied limits
    And executed is false, liveAzureRuns is 0, and cloudSpend is 0
    And all C001 Azure, IaC, scaffold, deployment, identity, and expenditure flags remain false
    And the result does not qualify Node 24, Express, or a native target

  Scenario Outline: Reject individual out-of-range metrics precisely
    Given explicit synthetic fixture bounds for every metric
    When "<path>" is "<case>"
    Then the result is rejected with a field error at "<path>"
    And the message states the supplied permitted interval
    And no operation is executed

    Examples:
      | path                                | case              |
      | envelope.load.requestsPerSecond     | below the minimum |
      | envelope.load.requestsPerSecond     | above the maximum |
      | envelope.load.concurrentUsers       | below the minimum |
      | envelope.load.concurrentUsers       | above the maximum |
      | envelope.durationSeconds            | below the minimum |
      | envelope.durationSeconds            | above the maximum |
      | envelope.capacity.units             | below the minimum |
      | envelope.capacity.units             | above the maximum |
      | envelope.budget.cloudSpend          | below zero        |
      | envelope.budget.cloudSpend          | above zero        |

  Scenario: Inclusive supplied bounds are not universal defaults
    Given complete bounds explicitly supplied by the caller
    When a metric equals its supplied minimum or maximum
    Then it is accepted if C001's zero-cloud envelope is also respected
    But omitted limits, missing endpoints, inverted ranges, or invalid limits are rejected
    And no missing field or bound is silently filled
    And changing a supplied non-cloud maximum changes that comparison

  Scenario Outline: Fail closed on unsafe data and unrecognised shapes
    Given a complete local validation request
    When the request contains "<invalid>"
    Then the result is rejected with an explicit field path and stable error code
    And invalid input is not coerced or executed

    Examples:
      | invalid                                                       |
      | null, array, string, or non-plain objects in a record position |
      | missing required or unknown fields at any object level       |
      | strings, booleans, null, fractions, NaN, or Infinity as numbers|
      | unsafe integers, BigInt, boxed numbers, or negative zero      |
      | accessors, symbols, inherited fields, or hidden properties    |
      | duplicate JSON fields or precision-losing number literals    |
      | a missing, malformed, or changed C001 approval                |

  Scenario Outline: Explicit bounds never escalate C001 authority
    Given C001 approves only design and local implementation
    When the operator supplies "<escalation>"
    Then the result is rejected with an explicit scope or authority error
    And C001's guard remains responsible for approval integrity and operation consent

    Examples:
      | escalation                                              |
      | a native, IaC, scaffold, deployment, identity, spend action|
      | a live Azure run count greater than zero                 |
      | a non-local mode                                         |
      | a cloud budget or cloud budget bound greater than zero   |
      | an approval, target, region, tenant, SKU, or extra flag    |

  Scenario: The operator sees the contract and precise validation errors
    Given the actual browser opens the standalone C002 surface
    Then C001's read-only approval and the local schema remain visible
    And envelope and limits start empty with no implicit limits
    When the operator explicitly loads the labelled synthetic local fixture
    And submits it using the keyboard
    Then an accessible live result reports a valid local envelope, not a cloud action
    When the operator submits out-of-range load, duration, capacity, and budget
    Then each field path, stable code, and permitted interval is visible
    When the operator submits malformed JSON or omits limits
    Then the failure is explicit and no previous successful result remains
    When the operator resets
    Then both inputs, result data, and stale errors are cleared
    And keyboard focus returns to the envelope input
    And no management calls or other network requests occur

  Scenario: Missing browser dependencies deny validation
    Given C001's snapshot or guard, the C002 schema, or validator cannot load
    When the operator opens the page
    Then validation remains disabled
    And an explicit unavailable, fail-closed message is visible
