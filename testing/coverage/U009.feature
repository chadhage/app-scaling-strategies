Feature: One command that enforces the 85/85/85 per-file coverage bar on a namespace
  Tooling item U009 (zero credit, kind unblock, entry gate U003 Done); it unblocks U010, U013 and U014
  Local, synthetic, offline: Node built-ins only, no browser, no network, no packages

  Scenario: Enumerate the production files and print the list a reviewer can compare with their own
    Given a namespace root with production scripts, a tests folder, evidence, fixtures, hidden folders and generated pins
    When I run node testing\coverage\gate.cjs --root <root>
    Then the enumerated production files are exactly the .js, .cjs and .mjs files that are not tests, evidence, fixtures, dependencies, hidden or generated pins
    And the JSON report and the readable summary both list every enumerated file, so the list can be compared with a hand-made one
    And every excluded file is listed with the rule or the manifest reason that excluded it

  Scenario: A production file that no test loads counts as 0 percent
    Given a production file that no test requires
    When Node runs the focused tests with coverage for that file
    Then Node prints no row for it and exits 0 (L-0003, L-0028, L-0043)
    But the gate reports it loaded false with lines 0, branches 0 and functions 0 and fails

  Scenario: Every file must reach the minimum in lines, branches and functions, with exact decimals
    Given a production file with 45 of 53 lines covered, which is 84.9057 percent
    When I run the gate with the default minimum of 85
    Then that file fails and the report keeps the exact decimals
    And a file with 861 of 1013 lines covered is 84.9951 percent, which Node prints as 85.00 but which is still below 85 and fails
    And a file at exactly the minimum passes

  Scenario: A nested failing test cannot pass because it inherited a test context
    Given the gate is started with NODE_TEST_CONTEXT=child-v8 in its environment (L-0002)
    When the focused tests of a fixture contain a failing test
    Then the child environment has NODE_TEST_CONTEXT removed and NODE_V8_COVERAGE set as an own undefined property, the failing test is seen and the gate fails
    And a run that prints no test summary at all is a failure too, never a pass

  Scenario: A run that fails, times out or finds no tests fails every file it covers
    Given high coverage and a failing test, a missing test file, no test files at all, or a hung test run
    When the gate runs
    Then each enumerated file is a failure with the reason named, even when its coverage is 100 percent
    And a hung run is ended with the process tree that this gate started, never by name and never any other process

  Scenario: A candidate that no rule and no manifest classifies fails as UNCLASSIFIED
    Given verification tooling such as verify.cjs, a script type that Node coverage cannot measure, or a link
    When the namespace has no coverage.manifest.json entry for it
    Then the gate fails, lists it under unclassified and never skips it silently
    And an exclude entry with a reason in coverage.manifest.json classifies it, while an entry without a reason is a usage error

  Scenario: One L-0004 command per production file, measured through lcov
    Given the production files of a namespace
    When the gate measures them
    Then it runs one node --test --experimental-test-coverage command per file with that file as the only include and the minimum on all three thresholds
    And it reads the lcov report for exact counts and proves it agrees with the table that Node prints in the same run
    And it never combines several include values in one command, which would hide a weak file behind the aggregate row

  Scenario: The JSON report and the exit code carry the verdict
    Given any namespace
    When the gate finishes
    Then stdout is one JSON document with schema, root, node, min, files, unclassified and pass, and --json writes the same document to a path
    And the exit code is 0 only on pass, 1 on any miss and 2 on a usage error

  Scenario: The gate passes its own gate and reproduces the reviewer figures for C031
    Given node testing\coverage\gate.cjs --root testing\coverage
    Then every production file of this namespace reaches 85 percent lines, branches and functions, and the fixtures are classified by the manifest
    And on capability\C031 the figures are cli.cjs 100/100/100, evaluator.js 100/99.76/100, page.js 100/97.1/100, saved.js 100/100/100 and source.cjs 100/100/100, read-only

  Scenario: The documented limits stay visible
    Given the README
    Then it states that browser-only scripts are measured only when a Node test loads them through a DOM stub or vm, that real browser V8 coverage is U010
    And it states Node's own semantics for uncalled functions, vacuous 100 percent for a metric with nothing to cover, and that PowerShell is not measured here

  # The scenarios below were added by the fix run R2-U009 after the independent review of the first publication (F1 to F5, minors m1 to m8).

  Scenario: F1 The nested run never writes into the coverage directory of the caller
    Given the gate is started under an outer NODE_V8_COVERAGE=<dir>
    When it measures a namespace
    Then the only V8 coverage file in <dir> belongs to the gate process itself, never to the node --test runner or its test files

  Scenario: F2 An internal error is a typed failure and never exit 0
    Given NODE_OPTIONS holds --unhandled-rejections=warn or none, and --scratch names a file
    When the gate runs
    Then stdout is a JSON failure report with error.type internal, stderr says internal error and the exit code is 1

  Scenario: F3 The --json path never keeps an older pass
    Given one --json path reused by a passing run, a usage error and a crash
    Then after each of them the path holds the report of that invocation: a pass, a failure with error.type usage, a failure with error.type internal
    And a run that never finishes leaves a started marker with pass false

  Scenario: F4 Matching a glob takes milliseconds whatever the pattern and the name
    Given a pattern with ten stars and a 60 character name, or eight ** groups and 44 folders
    When the enumeration matches them through --exclude, --include, --tests or coverage.manifest.json
    Then it finishes in milliseconds and ordinary patterns keep the semantics of the old translation

  Scenario: F5 --json replaces only a new file or a previous gate report
    Given --json names a production source file, a foreign text or JSON file, a directory, a device name, a link or a script name
    When the gate runs
    Then it exits 2 before anything is written and the existing file keeps its bytes

  Scenario: The report says what it is relative to and what it did not look at
    Given runs with --min below 85, with --include or --exclude, or with a repeated scalar flag
    Then fullBar is false with its reasons, and a repeated scalar flag is a usage error
    And the report lists the extensions that were seen but never considered, and an empty production file fails with its own reason

  # The scenarios below were added by the fix run R3-U009 after the second independent review (N1 to N11).

  Scenario: N1 The linearity of the glob matcher is observable and needs no clock
    Given the matcher reports its steps and a naive backtracking matcher counts its calls
    When hostile patterns (ten stars, eight ** groups, 20,000 character names) are matched in the same test
    Then the steps stay within tokens x (1 + 2 x characters) while the naive control exhausts its budget, and no test measures a duration

  Scenario: N2 The evidence test reads only what lives inside the namespace
    Given a copy of testing\coverage without capability\C031 and without .git
    Then the evidence test passes, and a separately named strict mode re-verifies the external inputs against the blobs of the accepted commit

  Scenario: N3 Every spelling of --json leaves no older pass behind
    Given a previous pass:true report at the path and --json=<path>, --help next to --json, or a read-only previous report
    Then the path holds a failure or a not-run report afterwards and the exit codes are unchanged

  Scenario: N4 The report is replaced by name, never written through a link
    Given the started marker is replaced by a hard link or another file while the gate runs
    Then the final write is refused with a typed failure, the other file keeps its bytes and no temporary file is left

  Scenario: N5 A missing archive fails the suite
    Given the self-gate archive, a replay, a RED or a whole generation of the evidence is deleted from a copy
    Then the evidence test fails, it does not skip
