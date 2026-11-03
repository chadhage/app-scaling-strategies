"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const helper = path.join(repo, "testing", "browser", "isolated.cjs");
const helperSha256 = "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055";
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(hash(helper), helperSha256, "Only the published 53c0c0d helper is qualified.");
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;

test("S029 actual isolated DOM, keyboard, error, reset, failure and CSP", { timeout: 120000 }, async (t) => {
  assert.equal(process.version, "v22.23.4");
  assert.equal(playwrightVersion, "1.56.1");
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const pageErrors = [];
  const attemptedNetwork = [];
  let session;
  let topLevelError = null;
  let cleanupError = null;
  let awaitedFinallyCloseResolved = false;
  async function step(name, work) {
    await t.test(name, async () => {
      try { observations.push({ name, passed: true, actual: await work() }); }
      catch (error) {
        observations.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
  }
  try {
    session = await openIsolatedLesson("learning\\S029\\index.html");
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).protocol === "file:") return route.continue();
      attemptedNetwork.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.reload({ waitUntil: "load" });
    const read = () => page.evaluate(() => ({
      readiness: document.getElementById("readiness-result").textContent,
      decision: document.getElementById("decision-result").textContent,
      comparison: document.getElementById("comparison-result").textContent,
      checks: document.getElementById("checks-result").textContent,
      verifier: document.getElementById("verifier-result").textContent,
      impact: document.getElementById("impact-result").textContent,
      trace: document.getElementById("current-trace").textContent,
      historyCount: document.getElementById("history-count").textContent,
      summaries: [...document.querySelectorAll("#history summary")].map((node) => node.textContent),
      error: document.getElementById("input-error").hidden ? null : document.getElementById("input-error").textContent,
      focus: document.activeElement.id
    }));
    const submit = () => page.locator("#check-window").click();
    async function keyboardChoice(id, downs) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < downs; index++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
    }

    await step("exact offline banner, initial unknown and keyboard skip link", async () => {
      assert.match(await page.title(), /^S029/);
      assert.equal(await page.locator(".training-banner").textContent(),
        "Training rehearsal - synthetic data - not a live Azure result");
      await page.locator(".skip").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.equal(actual.focus, "exercise");
      assert.equal(actual.readiness, "UNKNOWN — not checked");
      assert.equal(actual.historyCount, "0 / 8 checked runs");
      assert.equal(actual.error, null);
      return actual;
    });

    await step("keyboard submission rejects flapping despite two latest greens", async () => {
      await page.locator("#check-window").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.match(actual.readiness, /^FAILURE/);
      assert.match(actual.decision, /Guard HOLD.*route ga-v1.*candidate admissions 0/);
      assert.match(actual.comparison, /comparison ALLOW.*unsafe/);
      assert.match(actual.checks, /success 2 · failure 1 · unknown 0.*streak 2/);
      assert.match(actual.verifier, /verifier PASS/);
      assert.match(actual.trace, /t=4 · probe failure/);
      assert.match(actual.trace, /t=6 · probe success.*guard HOLD.*single-green ALLOW/);
      return actual;
    });

    await step("wrong prediction fails without forcing admission and is retained", async () => {
      await keyboardChoice("prediction", 1);
      assert.equal((await read()).readiness, "UNKNOWN — not checked");
      assert.equal((await read()).historyCount, "1 / 8 checked runs");
      await page.locator("#check-window").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.match(actual.verifier, /verifier FAIL.*predicted ALLOW/);
      assert.match(actual.decision, /Guard HOLD.*candidate admissions 0/);
      assert.match(actual.summaries[0], /verifier PASS/);
      assert.match(actual.summaries[1], /verifier FAIL/);
      await page.locator("#history summary").nth(1).focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#history details").nth(1).getAttribute("open"), "");
      return actual;
    });

    await step("a recovered fresh three-probe window allows one synthetic admission", async () => {
      await keyboardChoice("fixture", 2);
      await submit();
      const actual = await read();
      assert.match(actual.readiness, /^SUCCESS/);
      assert.match(actual.decision, /Guard ALLOW.*route candidate-v2.*candidate admissions 1/);
      assert.match(actual.checks, /success 3 · failure 0 · unknown 0/);
      assert.match(actual.verifier, /verifier PASS/);
      assert.match(actual.trace, /t=3 · probe failure.*guard HOLD/);
      assert.match(actual.impact, /not user journeys.*UNMEASURED.*no native/);
      return actual;
    });

    await step("strengthening the window exposes an earlier failure without erasing recovery", async () => {
      await page.fill("#window-size", "4");
      await page.fill("#freshness", "3");
      assert.equal((await read()).readiness, "UNKNOWN — not checked");
      assert.equal((await read()).historyCount, "3 / 8 checked runs");
      await submit();
      const actual = await read();
      assert.match(actual.readiness, /^FAILURE/);
      assert.match(actual.checks, /success 3 · failure 1 · unknown 0/);
      assert.match(actual.verifier, /verifier FAIL/);
      assert.match(actual.summaries[2], /SUCCESS.*guard ALLOW/);
      return actual;
    });

    await step("missing evidence remains unknown in the required-check denominator", async () => {
      await page.selectOption("#fixture", "missing");
      await page.fill("#window-size", "3");
      await page.fill("#freshness", "2");
      await page.selectOption("#prediction", "HOLD");
      await submit();
      const actual = await read();
      assert.match(actual.readiness, /^UNKNOWN/);
      assert.match(actual.checks, /3 required checks: success 2 · failure 0 · unknown 1/);
      assert.match(actual.decision, /Guard HOLD.*candidate admissions 0/);
      assert.match(actual.verifier, /verifier PASS/);
      assert.match(actual.trace, /t=5 · probe unknown/);
      return actual;
    });

    await step("old greens cannot pass at tick nine even when the comparison would allow", async () => {
      await page.selectOption("#fixture", "steady");
      await page.fill("#observe-tick", "9");
      await submit();
      const actual = await read();
      assert.match(actual.readiness, /^UNKNOWN/);
      assert.match(actual.checks, /success 0 · failure 0 · unknown 3/);
      assert.match(actual.comparison, /comparison ALLOW/);
      assert.match(actual.trace, /t=9 · probe no-new-sample · latest t=6 age=3/);
      assert.match(actual.decision, /Guard HOLD/);
      return actual;
    });

    await step("one early green neither borrows future samples nor shrinks the denominator", async () => {
      await page.fill("#observe-tick", "1");
      await submit();
      const actual = await read();
      assert.match(actual.checks, /success 1 · failure 0 · unknown 2/);
      assert.equal(actual.trace.split("\n").length, 1);
      assert.match(actual.readiness, /^UNKNOWN/);
      return actual;
    });

    await step("eight runs retain successes and failures; ninth rejection does not evict", async () => {
      await page.selectOption("#fixture", "flapping");
      await page.fill("#observe-tick", "6");
      await submit();
      const before = await read();
      assert.equal(before.historyCount, "8 / 8 checked runs");
      await submit();
      const actual = await read();
      assert.equal(actual.historyCount, before.historyCount);
      assert.deepEqual(actual.summaries, before.summaries);
      assert.equal(actual.trace, before.trace);
      assert.equal(actual.focus, "input-error");
      assert.match(actual.error, /eight runs retained/);
      return actual;
    });

    await step("keyboard reset clears evidence and errors, restores defaults and avoids method shadowing", async () => {
      await page.locator("#restart-lesson").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.equal(actual.readiness, "UNKNOWN — not checked");
      assert.equal(actual.historyCount, "0 / 8 checked runs");
      assert.equal(actual.error, null);
      assert.equal(actual.focus, "fixture");
      const defaults = await page.evaluate(() => ({
        fixture: document.getElementById("fixture").value,
        window: document.getElementById("window-size").value,
        freshness: document.getElementById("freshness").value,
        tick: document.getElementById("observe-tick").value,
        prediction: document.getElementById("prediction").value,
        resetMethod: typeof document.getElementById("exercise").reset,
        shadowingControls: document.querySelectorAll('[name="reset"],[id="reset"]').length
      }));
      assert.deepEqual(defaults, {
        fixture: "flapping", window: "3", freshness: "2", tick: "6",
        prediction: "HOLD", resetMethod: "function", shadowingControls: 0
      });
      return { actual, defaults };
    });

    await step("malformed numeric and tampered-select inputs focus errors without creating runs", async () => {
      const rejected = [];
      for (const value of ["", "2.5", "5", "2e0"]) {
        await page.fill("#window-size", value);
        await submit();
        const actual = await read();
        assert.equal(actual.focus, "input-error");
        assert.ok(actual.error);
        assert.equal(actual.historyCount, "0 / 8 checked runs");
        rejected.push({ value, error: actual.error });
      }
      await page.fill("#window-size", "3");
      await page.evaluate(() => {
        const select = document.getElementById("fixture");
        const option = document.createElement("option");
        option.id = "invalid-test-option";
        option.value = "forged-fixture";
        option.textContent = "Invalid test input";
        select.append(option);
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await submit();
      const tampered = await read();
      assert.match(tampered.error, /Invalid configuration/);
      assert.equal(tampered.historyCount, "0 / 8 checked runs");
      await page.locator("#restart-lesson").focus();
      await page.keyboard.press("Enter");
      await page.locator("#invalid-test-option").evaluate((node) => node.remove());
      const recovered = await read();
      assert.equal(recovered.error, null);
      assert.equal(recovered.focus, "fixture");
      return { rejected, tampered, recovered };
    });

    await step("real CSP denies code, connection, frame, object, worker, form and base changes before routing", async () => {
      const policy = await page.evaluate(async () => {
        window.__s029Csp = { inline: false, handler: false, violations: [] };
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__s029Csp.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const originalBase = document.baseURI;
        const script = document.createElement("script");
        script.textContent = "window.__s029Csp.inline = true";
        document.head.append(script);
        const button = document.createElement("button");
        button.setAttribute("onclick", "window.__s029Csp.handler = true");
        document.body.append(button);
        button.click();
        const frame = document.createElement("iframe");
        frame.src = "https://s029-csp.invalid/frame";
        document.body.append(frame);
        const object = document.createElement("object");
        object.data = "https://s029-csp.invalid/object";
        document.body.append(object);
        const base = document.createElement("base");
        base.href = "https://s029-csp.invalid/base/";
        document.head.append(base);
        const formProbe = document.createElement("form");
        formProbe.action = "https://s029-csp.invalid/form";
        formProbe.method = "post";
        document.body.append(formProbe);
        HTMLFormElement.prototype.submit.call(formProbe);
        const workerURL = URL.createObjectURL(new Blob(["postMessage('unexpected')"], { type: "text/javascript" }));
        try {
          const worker = new Worker(workerURL);
          worker.addEventListener("error", (event) => event.preventDefault());
          window.__s029Worker = worker;
        } catch (error) { window.__s029Csp.workerError = error.name; }
        window.__s029WorkerURL = workerURL;
        try { await fetch("https://s029-csp.invalid/connection"); window.__s029Csp.fetch = "unexpected success"; }
        catch (error) { window.__s029Csp.fetch = error.name; }
        window.__s029Csp.baseUnchanged = document.baseURI === originalBase;
        window.__s029CspNodes = [script, button, frame, object, base, formProbe];
        return document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
      });
      await page.waitForFunction(() => {
        const directives = window.__s029Csp.violations.map((event) => event.directive);
        return ["script-src-elem", "script-src-attr", "connect-src", "frame-src",
          "object-src", "worker-src", "form-action", "base-uri"].every((item) => directives.includes(item));
      });
      const enforced = await page.evaluate(() => window.__s029Csp);
      assert.equal(enforced.inline, false);
      assert.equal(enforced.handler, false);
      assert.equal(enforced.fetch, "TypeError");
      assert.equal(enforced.baseUnchanged, true);
      assert.deepEqual(attemptedNetwork, []);
      await page.evaluate(() => {
        for (const node of window.__s029CspNodes) node.remove();
        if (window.__s029Worker) window.__s029Worker.terminate();
        URL.revokeObjectURL(window.__s029WorkerURL);
      });
      await page.reload({ waitUntil: "load" });
      assert.equal((await read()).historyCount, "0 / 8 checked runs");
      await submit();
      assert.match((await read()).verifier, /verifier PASS/);
      return { policy, enforced, routedExternalRequests: attemptedNetwork.length };
    });

    await step("narrow viewport, labelled native controls, unique IDs and no page or network errors", async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      const actual = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
        return {
          uniqueIds: new Set(ids).size === ids.length,
          controlsLabelled: [...document.querySelectorAll("input,select")].every((node) => node.labels.length > 0),
          noHorizontalPageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          skipTarget: document.querySelector(".skip").getAttribute("href")
        };
      });
      assert.deepEqual(actual, {
        uniqueIds: true, controlsLabelled: true, noHorizontalPageOverflow: true, skipTarget: "#exercise"
      });
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(attemptedNetwork, []);
      assert.equal(hash(helper), helperSha256);
      return { ...actual, pageErrors, attemptedNetwork };
    });
    assert.ok(observations.every((item) => item.passed), "All actual browser checks must pass.");
  } catch (error) {
    topLevelError = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        awaitedFinallyCloseResolved = true;
      }
    } catch (error) {
      cleanupError = error.message;
      throw error;
    } finally {
      if (process.env.CAPTURE_BROWSER_EVIDENCE === "1") {
        let index = 1;
        let file;
        do { file = path.join(root, "evidence", `browser-observations-${String(index++).padStart(3, "0")}.json`); } while (fs.existsSync(file));
        fs.writeFileSync(file, `${JSON.stringify({
          cardId: "A-S029", workerId: "worker-A-S029", packet: "SC-S029", mode: "synthetic-only",
          startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
          playwrightVersion, browserVersion: session?.browserVersion || null,
          helperSha256, helperPublishedCommit: "53c0c0d", topLevelError, cleanupError,
          observations, pageErrors, attemptedNetwork, awaitedFinallyCloseResolved,
          limits: "Actual local DOM and CSP only; not native Azure, Node24 or production behavior. Known helper lifecycle limitation remains."
        }, null, 2)}\n`, { flag: "wx" });
        console.log(`Browser observations: ${path.relative(repo, file)}`);
      }
    }
  }
});
