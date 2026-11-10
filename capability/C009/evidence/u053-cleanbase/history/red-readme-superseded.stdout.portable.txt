TAP version 13
# Subtest: the importer section of the README names only what http-io.cjs exports and the server wires, with the parameters and options the functions declare
not ok 1 - the importer section of the README names only what http-io.cjs exports and the server wires, with the parameters and options the functions declare
  ---
  duration_ms: 381.8984
  type: 'test'
  location: '<USERPROFILE>\\repos\\app-scaling-strategies\\capability\\C009\\tests\\readme-contract.test.cjs:117:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + [
    +   'admit.refuse(socket, code, { immediate }): documents (socket, code, { immediate }) but admit.refuse declares (socket, code)'
    + ]
    - []
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual:
    0: 'admit.refuse(socket, code, { immediate }): documents (socket, code, { immediate }) but admit.refuse declares (socket, code)'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (<USERPROFILE>\repos\app-scaling-strategies\capability\C009\tests\readme-contract.test.cjs:118:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: the check has teeth: a documented option, parameter, function, listener, file or unknown name that does not exist fails by name
not ok 2 - the check has teeth: a documented option, parameter, function, listener, file or unknown name that does not exist fails by name
  ---
  duration_ms: 148.9496
  type: 'test'
  location: '<USERPROFILE>\\repos\\app-scaling-strategies\\capability\\C009\\tests\\readme-contract.test.cjs:121:1'
  failureType: 'testCodeFailure'
  error: |-
    the unchanged README has no problem
    + actual - expected
    
    + [
    +   'admit.refuse(socket, code, { immediate }): documents (socket, code, { immediate }) but admit.refuse declares (socket, code)'
    + ]
    - []
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual:
    0: 'admit.refuse(socket, code, { immediate }): documents (socket, code, { immediate }) but admit.refuse declares (socket, code)'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (<USERPROFILE>\repos\app-scaling-strategies\capability\C009\tests\readme-contract.test.cjs:143:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: the test file and test counts of the README are the counts of the newest suite manifest and of the tests directory
not ok 3 - the test file and test counts of the README are the counts of the newest suite manifest and of the tests directory
  ---
  duration_ms: 55.586
  type: 'test'
  location: '<USERPROFILE>\\repos\\app-scaling-strategies\\capability\\C009\\tests\\readme-contract.test.cjs:167:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + [
    +   'the README says 21 test files, the suite manifest of green-fix2 enumerates 32',
    +   'the README says 195 tests, the suite manifest of green-fix2 counts 892'
    + ]
    - []
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual:
    0: 'the README says 21 test files, the suite manifest of green-fix2 enumerates 32'
    1: 'the README says 195 tests, the suite manifest of green-fix2 counts 892'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (<USERPROFILE>\repos\app-scaling-strategies\capability\C009\tests\readme-contract.test.cjs:168:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: the figure check has teeth: a stale count or an unstated count fails
ok 4 - the figure check has teeth: a stale count or an unstated count fails
  ---
  duration_ms: 285.8058
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 1
# fail 3
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2442.0885
