Feature: Close C010's measured residuals without changing imported authority
  Background:
    Given the retained C010 publication e22b94da118bfe7f62fc8849b783adf14c36ae9d
    And the accepted C009 production snapshot is imported unchanged
    And all leases, tokens and requests are fictional on owned loopback listeners

  Scenario: Actual defaults reject the first entry above each boundary
    Given a C010 server with no limit overrides
    Then one conductor can hold exactly 100 entries but not 101
    And a 2048-character request target is routed but 2049 is URL_TOO_LONG
    And run units 100 are accepted but 101 are INPUT_INVALID

  Scenario: The work counter measures actual store passes
    Given a fresh store whose visited count is zero
    Then each lease pass adds the actual number of leases visited
    And each owned-resource pass additionally adds the actual number of resources
    And foreign, absent and expired lease lookups still visit every lease

  Scenario: Claims are header names, not header values
    When the request contains Accept: x-lease
    Then x-lease is not in ignoredClaims
    But an actual X-Lease header is reported by name

  Scenario: Local startup requests an automatic loopback port
    When startLocal is called with no port option
    Then listen is called with port zero on 127.0.0.1
    And the returned port and origin describe the actual responsive listener

  Scenario: A cut held mutation also has an expired token
    Given an authorized mutation is held inside the real commit hook
    When its client connection is cut and the server observes the destroyed socket
    And its token is expired using the injected clock before releasing the hook
    Then no effect, answer or audit record is written
    And moving token verification before the cancellation check fails this assertion

  Scenario Outline: Actual default timeouts produce typed, audited responses
    Given a real default-limits server whose idle timeout exceeds header timeout plus checking interval
    When a client sends <shape> and then remains silent
    Then a bounded poll observes exactly one typed 408 REQUEST_TIMEOUT
    And the server records the OTHER refused REQUEST_TIMEOUT audit entry
    And the connection is closed with no mutation applied
    Examples:
      | shape                                                        |
      | request line and a header without the terminating blank line  |
      | Content-Length 100 and exactly 13 body bytes                  |

  Scenario: The complete generator-owned campaign is accountable
    Then all original 806 positions have actual decisions
    And all 17 original equivalence proofs are retained byte for byte
    And every surviving original reviewer mutation fails a named assertion with a green real control
    And report.generated equals the total of the generator's own --list
    And any necessary extension is separately enumerated and decided
    And no timeout, file failure or environment fault is a kill

  Scenario: Amend evidence without rewriting history or claiming a new browser run
    Then every old capture and seal is retained with its original bytes
    And exact supersessions identify their original subject and its replacement
    And final evidence is captured after the last source, test, generator and documentation edit
    And every changed production file is loaded and reaches 85 percent each of lines, branches and functions
    And both LF and CRLF private trees pass
    And C009's own default stalled-header observation is reported without changing C009
    And no new Kano, Azure, Entra, deployment or spending qualification is claimed
