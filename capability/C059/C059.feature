Feature: The core conducting journey is operable with the keyboard and a screen reader
  C059 is a SYNTHETIC, LOCAL, OFFLINE fixture on 127.0.0.1 (automatic port, Node built-ins only). One page composes the
  journey: choose a mounted lesson (C041 host, read-only) -> conduct ONE validated step with its closed input contract
  (C042 engine, read-only, pinned in imports.json) -> see the explicit result -> use the offered recovery controls after a
  typed failure. It verifies ARIA semantics and keyboard operability PROGRAMMATICALLY. NO real screen reader (NVDA, JAWS,
  Narrator) was run and nothing is claimed about their behaviour. Not the approved Node 24 / Express / Entra control API.

  Background:
    Given a loopback service over the C042 engine and journal, and the C041 catalog of delivered lessons A-S001 and A-S003
    And the page loads the pinned C042 contract.js, the pinned C041 host files, journey.js, a11y-check.js and page.js

  Scenario Outline: The checker reports each accessibility defect by name (a negative fixture for every rule)
    Given a valid page fixture with exactly this defect: <defect>
    When a11y-check.js evaluates the DOM
    Then it returns a finding with code <code>, a selector and a message, and no finding on the valid fixture
    Examples:
      | defect | code |
      | a button without an accessible name | NAME_MISSING |
      | an aria-label that differs from the visible text | NAME_MISMATCH |
      | a duplicated id | ID_DUPLICATE |
      | the focus on an element that was removed | FOCUS_DETACHED |
      | the focus on the body | FOCUS_LOST |
      | no polite live region | LIVE_REGION_MISSING |
      | an announcement of success for a rejected outcome | ANNOUNCEMENT_CONTRADICTS_STATE |
      | a failure announcement without its typed code | ANNOUNCEMENT_INCOMPLETE |
      | a keyboard trap on Tab | KEYBOARD_TRAP |
      | an invalid field without aria-describedby | ERROR_FIELD_UNDESCRIBED |
      | the first invalid field not focused | ERROR_FOCUS |
      | two h1 or a skipped heading level | H1_COUNT or HEADING_ORDER |
      | no main landmark, no lang or no title | LANDMARK_MAIN, DOC_LANG or DOC_TITLE |
      | a busy state that is only visual | BUSY_NOT_PROGRAMMATIC |
      | a status shown by colour alone | COLOUR_ONLY |
      | a positive tabindex | TABINDEX_POSITIVE |
      | a radio group without a roving tab stop | ROVING_TABINDEX |
      | an outline removed without a replacement, no reduced-motion rule, a viewport that blocks zoom | FOCUS_INDICATOR_MISSING, REDUCED_MOTION_IGNORED, ZOOM_BLOCKED |

  Scenario: The page passes the checker after EVERY user action
    When the user renders the page, chooses a lesson, opens it, submits invalid fields, submits a valid step,
    receives a typed failure, uses retry, correct-and-resubmit, cancel, resume and inspect, closes the lesson and starts over
    Then after each action the checker finds nothing and the focus is on a named, visible, focusable target
    And never on the body or on a removed element

  Scenario: Keyboard only, in a logical order, with no trap
    Then every control is reachable with Tab and Shift+Tab in the expected order with a visible focus indicator
    And the lesson chooser follows the ARIA radio group pattern (one tab stop, arrow keys move and select, Space selects)
    And no key of a defined set (Tab, Shift+Tab, Enter, Space, Escape, arrows, Home, End, PageUp, PageDown) in any reachable state
      loses the focus or traps it

  Scenario: Form errors are programmatic and focused
    When the user submits a form with invalid fields
    Then the form is not sent, each invalid field has aria-invalid and aria-describedby its message, an error summary lists them
    And the first invalid field has the focus and the polite region says how many fields need correction, once

  Scenario: One polite status region announces each state change exactly once with a TRUE message
    When an action starts and finishes
    Then the progress and the explicit result are each announced once
    And a typed failure names its code and every offered recovery action
    And a success is never announced for a rejected, unsupported, unknown, interrupted or cancelled outcome

  Scenario: Every answer is validated and its wording is re-derived from facts
    When the server answer is a tampered envelope, malformed JSON or a lying HTTP status
    Then the page shows no success, no server prose, only the unknown outcome with its own wording and the offered actions
    And a recorded transcript is accepted only when every envelope validates

  Scenario: The loopback fixture refuses everything else and closes the connection
    When a request is foreign, oversized, cross-origin, a wrong method, an unknown route or carries an unread body
    Then ONE central refuse() answers with the typed status, Connection: close, and destroys the socket once flushed
    And an attacker in another process cannot starve a concurrent GET (small-heap child, bounded event-loop lag)

  Scenario: Imports are read-only and pinned
    Then every imported C041 and C042 file matches its raw, LF-normalized and git-blob SHA-256 at the accepted commit and tag
    And a tampered pin or a tampered archived RED or evidence file fails a named test

  Scenario: Real isolated headless Edge shows the same
    Then the accessibility tree (ariaSnapshot), the recorded Tab order and the checker agree on the real DOM
    And the browser, which allows only GET, reports an unreachable POST as unknown and never as success
