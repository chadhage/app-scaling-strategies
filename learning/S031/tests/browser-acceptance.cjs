"use strict";

module.exports = async function runS031BrowserAcceptance(page) {
  const checks = [];
  const cases = [];
  const httpRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const onRequest = (request) => {
    if (/^https?:/i.test(request.url())) httpRequests.push(request.url());
  };
  const onError = (error) => pageErrors.push(error.message);
  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  page.on("request", onRequest);
  page.on("pageerror", onError);
  page.on("console", onConsole);

  function check(condition, label) {
    if (!condition) throw new Error(`S031 browser assertion failed: ${label}`);
    checks.push(label);
  }
  async function foreground() {
    check(await page.evaluate(() => document.visibilityState === "visible"),
      "real page is visible before interaction");
  }
  async function scenario(caseId, execute) {
    const offset = checks.length;
    const actual = await execute();
    cases.push({ caseId, status: "passed", assertionsPassed: checks.length - offset, actual });
  }
  const control = (label) => page.getByLabel(label, { exact: true });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const mode = control("Session storage mode");
  const client = control("Synthetic client");
  const target = control("Requested version / instance");
  const fixture = control("Reply fixture");
  const editor = control("Supplied reply JSON");
  const read = button("Read profile at target");
  const verify = button("Verify supplied reply");
  const reset = button("Reset exercise");
  const text = (id) => page.locator(`#${id}`).innerText();
  const outcome = () => page.locator("#read-verdict").getAttribute("data-outcome");
  async function click(locator) {
    await foreground();
    await locator.click({ timeout: 4000 });
  }
  async function enter(locator) {
    await foreground();
    await locator.focus();
    await locator.press("Enter");
  }
  async function snapshot() {
    return page.evaluate(() => Object.fromEntries([
      "read-verdict", "reply-binding", "report-source", "expected-profile",
      "observed-profile", "assertion-rows", "client-rows", "store-snapshot",
      "run-verdict", "run-counts", "source-counts", "trace-events"
    ].map((id) => [id, document.getElementById(id).textContent])));
  }
  async function sameSnapshot(before, label) {
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), label);
  }
  async function fillAndVerify(value) {
    await foreground();
    await editor.fill(value);
    await click(verify);
  }

  try {
    await foreground();
    await page.evaluate(() => {
      window.__S031CspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__S031CspViolations.push(event.violatedDirective);
      });
    });

    await scenario("browser-final-local-keyboard", async () => {
      check(page.url().startsWith("file:"), "standalone file URL");
      check(await page.getByText(
        "Training rehearsal - synthetic data - not a live Azure result", { exact: true }
      ).isVisible(), "exact training banner visible");
      check(await outcome() === "not-tested", "initial result not tested");
      check(await page.locator("#trace-events li").count() === 3, "initial trace has only three seed/start events");
      check(await page.locator("#source-counts").count() === 1, "final source-breakdown assets loaded");
      const methods = await page.evaluate(() => {
        const form = document.getElementById("request-controls");
        return { reset: typeof form.reset, submit: typeof form.submit };
      });
      check(methods.reset === "function" && methods.submit === "function", "native form methods not shadowed");
      await mode.focus();
      await page.keyboard.press("Tab");
      check(await client.evaluate((node) => node === document.activeElement), "Tab reaches synthetic client");
      await page.keyboard.press("Tab");
      check(await target.evaluate((node) => node === document.activeElement), "Tab reaches target");
      await target.press("Home");
      await target.press("ArrowDown");
      check(await target.inputValue() === "v1/blue-b", "native keyboard selects same-version alternate instance");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      check(await read.evaluate((node) => node === document.activeElement), "Tab reaches read button");
      await page.keyboard.press("Enter");
      check(await outcome() === "interrupted", "keyboard read detects same-version local loss");
      check((await text("read-verdict")).includes("HTTP 200"), "lost local state still has HTTP 200");
      check((await page.locator('[data-assertion="http"]').innerText()).includes("PASS"), "transport assertion passes");
      check((await page.locator('[data-assertion="profile.present"]').innerText()).includes("FAIL"), "empty profile assertion fails");
      await target.selectOption("v2/green-a");
      await click(read);
      check(await outcome() === "interrupted", "ordinary mouse read detects cross-version local loss");
      await target.selectOption("v1/blue-a");
      await click(read);
      check(await outcome() === "preserved", "origin retains local declared state");
      check(await page.locator("#run-verdict").getAttribute("data-outcome") === "interrupted",
        "later passing read cannot erase interruptions");
      const counts = await text("run-counts");
      check(counts === "Attempted: 3 · Preserved: 1 · Interrupted: 2 · Unknown: 0", "local run totals");
      return { methods, counts, traceEvents: await page.locator("#trace-events li").count(), ordinaryMouseClicks: 2 };
    });

    await scenario("browser-final-shared-keyboard", async () => {
      await foreground();
      await mode.focus();
      await mode.press("Home");
      await mode.press("ArrowDown");
      check(await mode.inputValue() === "shared", "keyboard switches to shared");
      check(await outcome() === "not-tested", "mode switch is a new untested run");
      check(await page.locator("#trace-events li").count() === 3, "new mode retains only its own start/seed trace");
      const observations = [];
      for (const [clientId, destination] of [
        ["client-amber", "v2/green-a"], ["client-amber", "v1/blue-b"],
        ["client-amber", "v2/green-b"], ["client-cobalt", "v2/green-b"]
      ]) {
        await client.selectOption(clientId);
        await target.selectOption(destination);
        await enter(read);
        check(await outcome() === "preserved", `${clientId} preserved at ${destination}`);
        const expected = JSON.parse(await text("expected-profile"));
        const observed = JSON.parse(await text("observed-profile"));
        check(JSON.stringify(expected) === JSON.stringify(observed), "all declared fields match");
        check(observed.profileId === (clientId === "client-amber" ? "profile-amber" : "profile-cobalt"),
          "client state isolation");
        observations.push({ clientId, destination, revision: observed.revision, profileId: observed.profileId });
      }
      check(await page.locator("#run-verdict").getAttribute("data-outcome") === "all-observed-preserved",
        "shared run has no interruptions or unknowns");
      check((await page.locator("#assertion-rows tr td:last-child").allTextContents()).every((value) => value === "PASS"),
        "every final shared assertion passes");
      check(await text("source-counts") === "Stored-profile reads: 4 · Injected replies: 0 · Supplied samples: 0",
        "shared source counts identify four actual model store reads");
      return { observations, counts: await text("run-counts"), traceEvents: await page.locator("#trace-events li").count() };
    });

    await scenario("browser-final-faults", async () => {
      await click(button("200 reset profile"));
      check(await outcome() === "interrupted", "shared HTTP 200 reset is interrupted");
      check((await text("read-verdict")).includes("HTTP 200"), "reset fixture has HTTP 200");
      check(JSON.parse(await text("expected-profile")).revision === 7, "declaration remains revision 7");
      check(JSON.parse(await text("observed-profile")).revision === 0, "observed revision is reset to zero");
      const originalStore = await text("store-snapshot");
      for (const [replyKind, expectedOutcome] of [
        ["empty", "interrupted"], ["stale", "interrupted"], ["unknown", "unknown"]
      ]) {
        await fixture.selectOption(replyKind);
        await click(read);
        check(await outcome() === expectedOutcome, `${replyKind} reply cannot be preserved`);
        check(await text("store-snapshot") === originalStore, "fault does not alter store");
      }
      check(await text("run-counts") === "Attempted: 4 · Preserved: 0 · Interrupted: 3 · Unknown: 1",
        "failed and unknown replies remain in run totals");
      return { counts: await text("run-counts"), sources: await text("source-counts") };
    });

    await scenario("browser-final-invalid-data", async () => {
      const before = await snapshot();
      const errors = [];
      for (const [payload, code] of [
        ["{broken", "reply.json.invalid"], ["x".repeat(12001), "reply.text.invalid"]
      ]) {
        await fillAndVerify(payload);
        check(await page.locator("#input-error").isVisible(), "invalid text error is visible");
        const error = await text("input-error");
        check(error.startsWith(code), "correct explicit text rejection");
        errors.push(error);
        await sameSnapshot(before, "invalid text preserves all prior results, stores and trace");
      }
      for (const [id, invalidValue, errorCode] of [
        ["session-mode", "unrecognized-mode", "mode.invalid"],
        ["synthetic-client", "unrecognized-client", "client.invalid"],
        ["request-target", "v3/missing", "destination.invalid"],
        ["reply-fixture", "magic-success", "fixture.invalid"]
      ]) {
        const selector = page.locator(`#${id}`);
        const oldValue = await selector.inputValue();
        await selector.evaluate((node, value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = "Injected unknown input for a negative test";
          option.dataset.s031NegativeTest = "true";
          node.append(option);
        }, invalidValue);
        await foreground();
        await selector.selectOption(invalidValue);
        if (id !== "session-mode") await click(read);
        const error = await text("input-error");
        check(error.startsWith(errorCode), "unknown command is explicitly rejected");
        errors.push(error);
        await sameSnapshot(before, "unknown command preserves clients, stores, assertions, counters and trace");
        await selector.evaluate((node, value) => {
          node.value = value;
          node.querySelector('[data-s031-negative-test="true"]').remove();
        }, oldValue);
      }
      await fillAndVerify("null");
      check(await outcome() === "unknown", "valid JSON null is unknown rather than successful");
      check((await text("report-source")).includes("not a store read"), "sample provenance remains explicit");
      check(await page.locator("#run-verdict").getAttribute("data-outcome") === "interrupted",
        "unknown sample cannot erase previous failed reads");
      return { errors, counts: await text("run-counts"), latest: await text("read-verdict") };
    });

    await scenario("browser-final-sample-boundary", async () => {
      await click(reset);
      const before = await snapshot();
      await click(button("Fill declared matching sample"));
      await sameSnapshot(before, "filling a sample does not count as a read");
      await click(verify);
      check(await outcome() === "preserved", "matching sample verifies its declared fields");
      check((await text("run-verdict")).includes("no stored-profile read was observed"),
        "matching sample is not store-continuity proof");
      check(await text("source-counts") === "Stored-profile reads: 0 · Injected replies: 0 · Supplied samples: 1",
        "sample-only source totals");
      await click(read);
      check(await outcome() === "interrupted", "subsequent real local-map lookup still detects loss");
      await click(button("Fill declared matching sample"));
      const payload = JSON.parse(await editor.inputValue());
      payload.profile.draft = '<img id="s031-injected-markup" src="x" onerror="alert(1)">';
      await fillAndVerify(JSON.stringify(payload));
      check(await outcome() === "interrupted", "HTML-looking changed draft fails continuity");
      check(await page.locator("#s031-injected-markup").count() === 0, "supplied markup remains text, not an element");
      return { counts: await text("run-counts"), sources: await text("source-counts"), injectedElements: 0 };
    });

    await scenario("browser-final-reset", async () => {
      await fixture.selectOption("unknown");
      await click(read);
      await fillAndVerify("{broken");
      check(await page.locator("#input-error").isVisible(), "Reset begins with an invalid-input error visible");
      await click(reset);
      check(await mode.inputValue() === "local", "Reset restores local mode");
      check(await client.inputValue() === "client-amber", "Reset restores amber client");
      check(await target.inputValue() === "v2/green-a", "Reset restores requested target");
      check(await fixture.inputValue() === "stored", "Reset restores stored-profile fixture");
      check(await outcome() === "not-tested", "Reset result is untested, not success");
      check(await page.locator("#run-verdict").getAttribute("data-outcome") === "not-tested", "Reset whole run untested");
      check(await text("run-counts") === "Attempted: 0 · Preserved: 0 · Interrupted: 0 · Unknown: 0", "Reset clears all outcome counters");
      check(await text("source-counts") === "Stored-profile reads: 0 · Injected replies: 0 · Supplied samples: 0", "Reset clears source counters");
      check(await page.locator("#trace-events li").count() === 3, "Reset restores only three initial trace events");
      check(await page.locator("#client-rows tr").count() === 2, "Reset preserves two declared clients");
      check((await text("client-rows")).includes("revision 7") && (await text("client-rows")).includes("revision 11"),
        "Reset restores original nonzero revisions");
      check(!await page.locator("#input-error").isVisible(), "Reset clears the error");
      check(await mode.evaluate((node) => node === document.activeElement), "Reset returns focus to storage mode");
      await page.keyboard.press("Tab");
      check(await client.evaluate((node) => node === document.activeElement), "Tab works after Reset");
      await page.keyboard.press("Shift+Tab");
      check(await mode.evaluate((node) => node === document.activeElement), "Shift+Tab returns to mode");
      const methods = await page.evaluate(() => {
        const form = document.getElementById("request-controls");
        return { reset: typeof form.reset, submit: typeof form.submit };
      });
      check(methods.reset === "function" && methods.submit === "function", "native form methods still callable after Reset");
      return { mode: await mode.inputValue(), outcome: await outcome(), counts: await text("run-counts"), focus: "session-mode", methods };
    });

    const cspViolations = await page.evaluate(() => window.__S031CspViolations);
    check(httpRequests.length === 0, "no HTTP requests during browser acceptance");
    check(pageErrors.length === 0, "no browser page errors during acceptance");
    check(consoleErrors.length === 0, "no browser console errors during acceptance");
    check(cspViolations.length === 0, "no CSP violations during acceptance");
    await foreground();
    return {
      status: "passed",
      url: page.url(),
      assertionsPassed: checks.length,
      cases,
      httpRequests,
      pageErrors,
      consoleErrors,
      cspViolations,
      visibleAtEnd: true,
      forcedClicks: false,
      skippedAssertions: false
    };
  } finally {
    page.off("request", onRequest);
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
};
