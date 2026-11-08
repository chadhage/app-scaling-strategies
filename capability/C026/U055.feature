Feature: C026 documentation and amendment-head authority describe the accepted U040 facts
  Training rehearsal - synthetic data - local loopback only - not a live Azure result
  U055 earns no credit and changes no functional production behavior.

  Scenario: The minimum parsed request and the reviewed worst case are stated accurately
    Given GET / HTTP/1.1 followed by two CRLF pairs is 18 bytes
    Then an aligned 65536-byte read fits 3640 complete requests of that shape
    And one 18-byte marking request leaves room for 3639 further requests
    And the README and the drop-budget comment distinguish the review's 3639-request observation from that ceiling
    And the README attributes about 6 MB per socket, about 0.8 GB at 128 connections,
        and a 12 to 15 second stall at 32 sockets to the accepted review, not a guarantee

  Scenario: The successful transcript answer has an exact drop boundary
    When one write contains a transcript request followed by 16 ordinary reads
    Then only the transcript receives a 200 answer and no drop-limit event occurs
    When one write contains a transcript request followed by 17 ordinary reads
    Then no answer arrives and exactly one drop-limit event occurs
    And a held transcript uses the same per-connection boundary

  Scenario: An independent repository anchor covers the current last addendum
    Given the current-authority addendum is chained to the accepted addendum 2
    When any informational byte of the current last addendum is altered
    Then verification fails by the name of that addendum
    And a missing head, a broken link, an unknown amendment, or an unanchored successor fails

  Scenario: The evidence notes distinguish four final variants from the retained first attempt
    Then the control documents real, refuse, hold, and expect as four flood variants
    And the original first RED still has three variants
    And the missing intermediate README with hash 032309f1 is explicitly unavailable
    And no historical raw transcript, manifest, seal, or RED is rewritten

  Scenario: A source-comment replacement is not a casual source-byte repin
    Given the original server bytes are retained exactly
    Then the amendment authorizes only the changed comment bytes
    And executable source is identical after comments are removed
    And the full server file is measured at 85 percent lines, branches, and functions
    And the namespace and the actual consumers are rerun
