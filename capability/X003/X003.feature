Feature: One original X003 goal-based local learning suggestion
  X003 is the frozen L/P0 member of LP-LEARN, parent H002.
  Its six named S companions are already accepted, not six new credits.
  Training rehearsal - synthetic data - not a live Azure result.

  Background:
    Given unchanged C005 source c8b3139f07aa60a64833a5380503b2bd794c0e0e
    And catalog-data SHA256 193cc3dd536b2202f5b941366c151d11d4e01ad2d3bbb2d179ce94cf16ff76f6
    And its 152 entries contain all 150 accepted portable lessons
    And W001 and W002 are unavailable with zero native runnable or qualified entries
    And unchanged C006 literal search and C007 AND filters supply eligibility

  Scenario Outline: A chosen source goal yields a relevant fixed practice
    When I choose "<goal>" and recommend
    Then the suggested source ID is "<id>"
    And its accepted lesson URL is "../../learning/<id>/index.html"
    And its category and literal title/objective match the declared goal mapping
    And repeating identical input returns exactly identical output without mutating input
    Examples:
      | goal                        | id   |
      | warm-handoff                | S001 |
      | effective-capacity          | S011 |
      | preserve-session            | S031 |
      | finish-admitted-work        | S041 |
      | version-contracts           | S051 |
      | abort-unready               | S091 |
      | verify-user-correctness      | S147 |
      | retire-without-dependencies  | S150 |

  Scenario: Eligibility is literal search AND mapped category AND accepted portability
    Given literal "blue-green" also matches S124 and S128 outside category A
    When someone changes S001 availability under the same historical metadata pins
    Then the changed source is visibly rejected
    And no unrelated, random, workflow, or native lesson replaces it

  Scenario: Unchanged source pins cannot bless changed catalog content
    Given the exact immutable C005 catalog and C003 matrix are loaded
    When a caller supplies schema-valid changed content under the original metadata pins
    Then the source mismatch is visibly rejected without any recommendation or practice link
    And no fabricated objective or availability is attributed to the accepted source

  Scenario Outline: Invalid goals are visible errors with no retained recommendation
    When the goal input is "<invalid>"
    Then no recommendation or practice link remains
    And an accessible error identifies blank, type, unsafe, unknown, or unavailable input
    Examples:
      | invalid                |
      | blank                  |
      | nonprimitive           |
      | markup or path         |
      | unknown goal           |
      | progressive-rings      |
      | shared-preview         |

  Scenario: A real keyboard user chooses, inspects, practices, returns and resets
    Given the published isolated helper opens installed signed Edge without downloads
    When I choose a goal with the keyboard and activate Recommend
    Then focus announces the suggested lesson and exact relevance explanation
    When I inspect why, follow the actual local lesson and return
    Then the chooser is usable and Reset clears only in-memory local state
    And labels, status, errors, unique IDs and fixed unique link targets are observed
    And the exact source, historical boundaries and rehearsal banner remain visible
    And browser CSP rejects inline code and outbound connections

  Scenario: Evidence capture is deliberate and publication is narrowly authorized
    Given ordinary focused checks do not write source or evidence
    Then only exact CAPTURE_BROWSER_EVIDENCE=1 appends uniquely named raw evidence
    And genuine stub RED, failures, raw bytes and canonical differences remain retained
    And immutable captured publisher proof is distinct from current permission
    And current canonical permission and private publisher bytes are rechecked inside locks
    And ordinary foreign staged entries remain unchanged, including every index flag
    And actual unmerged index entries still block publication
    And only capability\X003 is published through the unchanged standard publisher
    And one original L awaits independent parent acceptance without completing H002
