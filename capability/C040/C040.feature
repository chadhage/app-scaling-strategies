Feature: Inspect cohort, effect and latency result tables so that failed and unknown attempts stay visible
  Training rehearsal - synthetic data - not a live Azure result
  Original C040 S / packet H007; independently Done gates C029, C030 and C031; local, offline and fictional; IaC N/A

  Scenario: Build three tables from the saved, accepted producer outputs with the producers' own numbers
    Given the saved C031 cohort output, the saved C030 effect output and the saved C029 latency output of one saved set
    When I build the cohort, effect and latency tables
    Then the cohort table has one row per client with its C031 reason code and the producer's eligible count, actual transitions and rate with numerator and denominator
    And the effect table has one row per intended effect of each original with the complete effect key, the application bounds, the delivery count and a verdict of missing, duplicate, one intended effect or unknown
    And the latency table has one row per journey with its original budget, its observed value, a verdict of within, exceeded, failed or unknown and the producer's own flag that a retry cannot hide the original
    And every number shown equals the number the producer's own evaluator reports for the same saved set, never a second formula

  Scenario: Every row carries an explicit status and a status the inspector does not recognise is UNKNOWN
    Given a producer row whose status is not in the closed vocabulary of its table
    When I build the table
    Then the row is kept, shows the status UNKNOWN with the producer's own text and the flag UNRECOGNISED_STATUS
    And it is never skipped and never shaped like a success

  Scenario: Failed and unknown rows can never disappear
    Given a saved set with 3 failed and 2 unknown rows among 40 successes
    When I sort by any column in either direction, apply the status filter "success", search for a text that matches no failure or page the rows
    Then all 5 failed and unknown rows stay visible in every one of those views
    And a filter or search that would have hidden them says so, names the statuses and says how to show everything

  Scenario: The summary spells out shown of total and every status count, and the counts add up to the total
    Given any table in any view
    When I read its summary
    Then it says how many rows are shown of how many in total and gives every status count including the zero counts
    And the status counts always add up to the total, in the model and on the rendered page
    And the counts are derived from the rows, never from a second counter

  Scenario: A filter that hides rows says how many and which statuses
    Given a table with success, neutral, failed and unknown rows
    When a status filter hides rows
    Then the note says how many rows it hides and which statuses they have
    And success only is neither the default view nor the only view

  Scenario: An empty saved set says no attempts recorded
    Given a saved set whose producer output holds no rows
    When I build the table
    Then it says "no attempts recorded", shows 0 of 0 and never says all passed, never 100 percent and never a success rate

  Scenario: A truncated saved set says INCOMPLETE and keeps the producer's total
    Given a saved set that holds fewer rows than the producer's own total
    When I build the table
    Then the state is INCOMPLETE and the total shown is the producer's total, not the shorter count
    And the rows the saved set does not hold are counted as NOT_SAVED, so the status counts still add up to the producer's total

  Scenario: A duplicated row is kept and flagged
    Given a saved set in which the same row appears twice
    When I build the table
    Then both rows are kept, both carry the flag DUPLICATE_ROW, and the state names the extra row against the producer's total

  Scenario: An original with no effect rows is still visible
    Given the saved historical effect output where an original has no effect receipts
    When I build the effect table
    Then that original has one UNKNOWN row that says no effect rows were saved, never zero failures

  Scenario: Static keyboard page with a tablist, sort, filter and live announcements
    Given a static page with the exact training banner and a strict content security policy
    When I use the keyboard to choose a saved set, switch tables with the arrow keys, sort a column and apply a status filter
    Then the summary line and an aria-live announcement change after every action
    And failed and unknown rows keep text labels and stay in the table, and the rendered status counts add up to the total
    And the rendered row identifiers stay unique after every action

  Scenario: Verification is read-only and publication is scoped
    Given unchanged accepted source pins and fictional saved data
    When the focused, coverage and real isolated Edge checks run
    Then no accepted source byte changes and every production file reaches 85 percent lines, branches and functions
    And production Node 24, Express, Entra and any real service are neither validated nor registered
