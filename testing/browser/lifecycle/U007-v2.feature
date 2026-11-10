@U007 @zero_credit @scan_identity_v2
Feature: Revalidate destructive authority after every awaited directory scan
  The original budget, backoff, attempt cap and exclusive-creation model remain.
  V1 and the accepted 514-file baseline are immutable historical inputs.

  Scenario Outline: An awaited root or descendant scan loses destructive authority
    Given the exclusively recorded root or ancestor identity changes during <scan>
    When the awaited scan returns
    Then V2 revalidates the recorded root and ancestry before removal
    And no removal is issued for the replacement
    And a typed ownership refusal and remaining root are reported
    Examples:
      | scan                     |
      | root enumeration         |
      | descendant enumeration   |
      | remaining-path scan      |
      | a later retry scan       |

  Scenario: A disappeared root confirms absence without a destructive call
    Given the root disappears during an awaited scan
    When revalidation freshly observes its absence
    Then the root is confirmed absent without another removal

  Scenario: Revalidation consumes the original remaining budget
    Given enumeration or the final identity read consumes the original deadline
    When cleanup would otherwise record a destructive attempt
    Then no removal attempt is fabricated
    And scan-expiry and verification-expiry observations retain their actual phases

  Scenario: Current proof cannot borrow V1 mutation or coverage credit
    Given the corrected V2 source differs from V1
    When current proof is evaluated
    Then both whole production files are independently measured
    And all original semantic mutation tuples are retargeted with offsets only
    And all current variants are executed and survivors need new paired witnesses
    And the exact parent regression and original behavioral REDs remain unchanged
