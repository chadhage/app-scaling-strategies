Feature: Shadow getProfile without moving production or duplicating effects
  All requests, profiles, counters and effects are synthetic local fixtures.
  No traffic is replayed into production, Azure or another external system.

  Background:
    Given the visible disclaimer is "Training rehearsal - synthetic data - not a live Azure result"
    And the rehearsal starts with no requests or business effects
    And the production getProfile fixture records one profile-view write and one notification per request
    And the separate candidate attempts those same effects through a shadow sink

  Scenario Outline: Safe shadow preserves the intended production response
    Given the intended production version is "<production>"
    And the matching candidate fixture suppresses shadow writes and notifications
    When I replay 2 synthetic getProfile requests
    Then both caller responses are served by "<production>"
    And the candidate is the other version and never answers the caller
    And the business response comparison is "MATCH"
    And the verdict is "SAFE"
    And the total profile-view writes and notifications are each 2
    And the shadow suppresses 2 writes and 2 notifications
    And both duplicate-effect counters are 0

    Examples:
      | production |
      | v1         |
      | v2         |

  Scenario: Response discrepancies do not replace the production response
    Given the discrepant candidate changes membershipTier and loyaltyPoints
    When I replay 1 synthetic getProfile request
    Then the caller still receives the intended production profile
    And the candidate response is displayed separately
    And both changed fields show production and candidate values
    And the verdict is "DISCREPANT"
    And the shadow produces no writes or notifications

  Scenario: A matching response can still have unsafe duplicate effects
    Given I explicitly select the unsafe duplicate-effect fixture
    When I replay 3 synthetic getProfile requests
    Then the business response comparison is "MATCH"
    But the verdict is "UNSAFE"
    And the intended production version still answers all callers
    And the total profile-view writes and notifications are each 6 instead of 3
    And both duplicate-effect counters are 3
    And the unsafe outcome is prominently identified as a synthetic failure

  Scenario: A later safe replay does not erase an earlier unsafe effect
    Given an unsafe replay duplicated 1 write and 1 notification
    When I replay a matching request with shadow effects suppressed
    Then the latest verdict is "SAFE"
    But cumulative duplicate writes and notifications remain 1
    And the earlier unsafe batch remains inspectable

  Scenario: A missing candidate response is unknown, not a match
    Given I select the unknown candidate-response fixture
    When I replay 1 synthetic getProfile request
    Then the caller still receives the intended production response
    And the candidate response is explicitly unavailable
    And the comparison and verdict are "UNKNOWN"
    And no candidate response or safety conclusion is invented
    And shadow writes and notifications remain suppressed

  Scenario Outline: Invalid input fails closed before replay
    Given I have existing synthetic observations
    When I try to replay with "<invalid>"
    Then the verdict is "INVALID"
    And the existing request records and all effect counters are unchanged
    And no traffic or effects are added

    Examples:
      | invalid                        |
      | a profile outside the fixtures |
      | an unknown scenario            |
      | an unknown production version  |
      | an empty request count         |
      | a fractional request count     |
      | a negative request count       |
      | more than 3 requests per batch |
      | a non-finite request count     |
      | an unknown input field         |

  Scenario: The local rehearsal has a finite traffic budget
    Given 30 synthetic requests have already been replayed
    When I try to replay another request
    Then the verdict is "INVALID"
    And the 30 existing requests and counters are preserved
    And Reset is required before further replay

  Scenario: Keyboard operation and Reset restore a clean rehearsal
    Given I operate the labeled native controls with the keyboard
    And I have observed discrepant, unknown, invalid and unsafe outcomes
    When I activate Reset
    Then all counters, request records and discrepancy rows are empty
    And the verdict is "NOT RUN"
    And production v1, the first synthetic profile, 2 requests and safe shadow are selected
    And the form's reset and submit methods have not been shadowed by controls
    And no persistent storage, credentials, network or management calls are used
