Feature: C059 review fixes (second worker): the checker has no false negatives, the flood test is structural, every guard is mutated, a request pipelined behind a refusal never runs
  The first publication (14cefdea) was rejected by rev-C059 on three majors (F1 checker false negatives, F2 a load-dependent flood test,
  F3 guards that no test notices), six minors and two informational findings; the controller added a fourth major in all but name:
  HTTP pipelining behind a refusal. This specification is NEW; C059.feature and the first RED, GREEN and coverage archives stay as they were.

  Scenario Outline: F1 a defective page is reported by NAME, on the DOM stub and on the real DOM in Edge
    Given a page that is valid except for "<defect>"
    When the checker evaluates it
    Then the findings include "<codes>" and the real page still has no finding after every action
    Examples:
      | defect                                                 | codes                                        |
      | a mouse-only div role=button without tabindex (K5)     | CONTROL_NOT_REACHABLE, ROLE_NOT_FOCUSABLE    |
      | a button with tabindex=-1 (K6) or a link with it (K7)  | CONTROL_NOT_REACHABLE, TABINDEX_NEGATIVE     |
      | a span role=link without tabindex (K8)                 | CONTROL_NOT_REACHABLE, ROLE_NOT_FOCUSABLE    |
      | a focusable button inside an aria-hidden container (K3)| ARIA_HIDDEN_FOCUSABLE                        |
      | role=status with aria-live=off (V2)                    | LIVE_REGION_OFF, LIVE_REGION_MISSING         |
      | a polite live region with aria-hidden=true (V3)        | LIVE_REGION_HIDDEN, LIVE_REGION_MISSING      |
      | button role=heading, h2 role=button, input role=button | ROLE_MISMATCH                                |
      | role=checkbox or role=radio without aria-checked (K9)  | STATE_MISSING                                |
      | a disabled button with tabindex=0 (K11)                | DISABLED_FOCUSABLE and not FOCUSABLE_NO_ROLE |

  Scenario: F1 walkTab finds an unreachable control independently of the focusable set
    Given a page whose only control is a div role=button without tabindex
    When Tab is pressed around the cycle
    Then CONTROL_NOT_REACHABLE names the control although the sequential order is empty

  Scenario: F5 checkStyles has neither the reported false positives nor the reported false negatives
    Given style sheets that use a :focus-visible ring beside :focus:not(:focus-visible), min-height, no-preference motion and print fonts
    Then there is no finding
    And outline: 0px, outline-width: 0px, a transparent outline, an uncovered reduced-motion selector and max-height in em are reported

  Scenario: F2 and F4 a refusal flood is judged by structure and a same-run control, never by seconds
    Given an attacker in another process and the service in a small-heap child beside a naive keep-alive server and a bare 400-and-close server
    Then every attacker socket is closed by the service, connections reach 0, a GET is answered after the flood and the bytes parsed after a refusal are bounded
    And the naive keep-alive server fails the same assertions by name

  Scenario: F3 every guard has a named killer
    Given every statement of page.js and every single condition of a11y-check.js removed in a private copy
    Then a named test fails for every non-equivalent mutant and the equivalent ones are listed with their reason

  Scenario: F6 an answer is bound to its request
    Given a valid envelope of ANOTHER step (another key, another lease, 9 units)
    Then the page refuses it as ANSWER_REJECTED and keeps its own key, and a shape-valid number out of range is refused too

  Scenario: F7 the host note is true after a lesson is chosen
    Then #host-note never says that no lesson is selected while a lesson is chosen

  Scenario: F8 a request without an answer is abandoned after a deadline
    Given a service that accepts a request and never answers
    When the deadline passes
    Then the request is aborted, the failure is typed NO_ANSWER_IN_TIME, it is announced once, Retry and Inspect are offered and the page is no longer busy

  Scenario Outline: PIPE a request pipelined behind a refusal never runs
    Given a service in a separate process and a raw socket
    When one write carries "<requests>"
    Then the lease ledger and the step state are unchanged, the client receives only the answers of earlier requests and the refusal, and the connection is closed
    Examples:
      | requests                                                         |
      | a refused request then a valid submit                            |
      | a valid GET, a refused request, then a valid submit              |
      | a valid submit then a refused request (the submit applies)       |
      | an invalid body, an unknown field or a missing field, then a submit |
      | a capacity or step-limit rejection, then a submit                |
      | every refusal status of the table, first and in the middle       |
