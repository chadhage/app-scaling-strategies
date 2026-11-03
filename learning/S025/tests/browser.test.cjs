"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const lesson = path.resolve(__dirname, "..");
const repo = path.resolve(lesson, "..", "..");
const helper = path.join(repo, "testing", "browser", "isolated.cjs");
const helperSha256 = "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055";
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(hash(helper), helperSha256, "Only published helper 53c0c0d is qualified.");
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;

test("S025 actual isolated DOM, keyboard, errors, failure, history, reset and CSP", { timeout: 120000 }, async (t) => {
  assert.equal(process.version, "v22.23.4");
  assert.equal(playwrightVersion, "1.56.1");
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const pageErrors = [];
  const attemptedNetwork = [];
  let session;
  let closeResolved = false;
  let topLevelError = null;
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
    session = await openIsolatedLesson("learning\\S025\\index.html");
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).protocol === "file:") return route.continue();
      attemptedNetwork.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.reload({ waitUntil: "load" });
    const read = () => page.evaluate(() => ({
      initialization: document.getElementById("initialization-result").textContent,
      latency: document.getElementById("latency-result").textContent,
      outcome: document.getElementById("outcome-result").textContent,
      verifier: document.getElementById("verifier-result").textContent,
      timing: document.getElementById("timing-result").textContent,
      trace: document.getElementById("current-trace").textContent,
      rows: [...document.querySelectorAll("#phase-rows tr")].map((row) => row.textContent),
      historyCount: document.getElementById("history-count").textContent,
      history: document.getElementById("history").textContent,
      error: document.getElementById("input-error").hidden ? null : document.getElementById("input-error").textContent,
      focus: document.activeElement.id
    }));
    const compare = () => page.locator("#compare-traces").click();
    const selectAll = async (condition) => {
      for (const phase of ["jvm", "beans", "pool", "cache"]) {
        await page.selectOption(`#${phase}-condition`, condition);
      }
    };
    const keyboardCompare = async () => {
      await page.locator("#compare-traces").focus();
      await page.keyboard.press("Enter");
    };
    const keyboardReset = async () => {
      await page.locator("#reset-exercise").focus();
      await page.keyboard.press("Enter");
    };
    const keyboardChoice = async (id, downs) => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < downs; index++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
    };

    await step("offline load has the exact banner, labelled controls and unchecked result", async () => {
      assert.match(await page.title(), /^S025/);
      assert.equal(await page.locator(".training-banner").textContent(),
        "Training rehearsal - synthetic data - not a live Azure result");
      const result = await read();
      assert.match(result.outcome, /^UNKNOWN — not compared/);
      assert.equal(result.historyCount, "0 / 8 retained runs");
      assert.equal(await page.locator("#jvm-condition").inputValue(), "skipped");
      assert.equal(result.error, null);
      return result;
    });

    await step("keyboard comparison records cold initialization and latency failure honestly", async () => {
      await keyboardCompare();
      const result = await read();
      assert.match(result.initialization, /^FAILURE — 0\/4/);
      assert.match(result.latency, /^FAILURE — 1040 ms > 200 ms/);
      assert.match(result.outcome, /^FAILURE — HOLD/);
      assert.match(result.verifier, /^Verifier PASS/);
      assert.equal(result.timing, "Cold / candidate / saved: 1040 ms / 1040 ms / 0 ms");
      assert.equal(result.rows.length, 4);
      return result;
    });

    await step("all four native selects work by keyboard and prime the 100 ms candidate", async () => {
      for (const phase of ["jvm", "beans", "pool", "cache"]) await keyboardChoice(`${phase}-condition`, 1);
      await keyboardChoice("prediction", 1);
      assert.match((await read()).outcome, /^UNKNOWN — not compared/);
      await keyboardCompare();
      const result = await read();
      assert.match(result.initialization, /^SUCCESS — 4\/4/);
      assert.match(result.latency, /^SUCCESS — 100 ms ≤ 200 ms/);
      assert.match(result.outcome, /^SUCCESS — EXPOSE.*no traffic moved/);
      assert.match(result.verifier, /^Verifier PASS/);
      assert.equal(result.timing, "Cold / candidate / saved: 1040 ms / 100 ms / 940 ms");
      assert.match(result.history, /Run 1 \[synthetic\] · FAILURE.*Run 2 \[synthetic\] · SUCCESS/s);
      return result;
    });

    await step("initialization success cannot hide failed client latency or a wrong answer", async () => {
      await page.locator("#budget-ms").fill("80");
      assert.match((await read()).outcome, /^UNKNOWN — not compared/);
      await keyboardCompare();
      const result = await read();
      assert.match(result.initialization, /^SUCCESS/);
      assert.match(result.latency, /^FAILURE — 100 ms > 80 ms/);
      assert.match(result.outcome, /^FAILURE — HOLD/);
      assert.match(result.verifier, /^Verifier FAIL/);
      return result;
    });

    await step("a generous client budget cannot waive skipped initialization", async () => {
      await selectAll("skipped");
      await page.locator("#budget-ms").fill("2000");
      await page.selectOption("#prediction", "HOLD");
      await compare();
      const result = await read();
      assert.match(result.initialization, /^FAILURE/);
      assert.match(result.latency, /^SUCCESS — 1040 ms ≤ 2000 ms/);
      assert.match(result.outcome, /^FAILURE — HOLD/);
      assert.match(result.verifier, /^Verifier PASS/);
      return result;
    });

    await step("a failed bean phase is FAILURE and has no invented client sample", async () => {
      await selectAll("primed");
      await page.locator("#budget-ms").fill("200");
      await page.selectOption("#beans-condition", "failed");
      await compare();
      const result = await read();
      assert.match(result.initialization, /^FAILURE — 3\/4/);
      assert.match(result.latency, /^UNKNOWN.*UNMEASURED/);
      assert.match(result.timing, /1040 ms \/ UNMEASURED \/ UNMEASURED/);
      assert.match(result.outcome, /^FAILURE — HOLD/);
      return result;
    });

    await step("an unmeasured pool remains UNKNOWN while prior failures stay retained", async () => {
      await page.selectOption("#beans-condition", "primed");
      await page.selectOption("#pool-condition", "unmeasured");
      await compare();
      const result = await read();
      assert.match(result.initialization, /^UNKNOWN — 3\/4.*0 failure, 1 unknown/);
      assert.match(result.outcome, /^UNKNOWN — HOLD/);
      assert.match(result.verifier, /^Verifier PASS/);
      assert.match(result.history, /Run 3 \[synthetic\] · FAILURE/);
      return result;
    });

    await step("unmeasured and unsupported routes never borrow measured-read client samples", async () => {
      await page.selectOption("#pool-condition", "primed");
      const results = [];
      for (const route of ["unmeasured-export", "unsupported-stream"]) {
        await page.selectOption("#route", route);
        await compare();
        const result = await read();
        assert.match(result.initialization, /^SUCCESS/);
        assert.match(result.outcome, /^UNKNOWN — HOLD/);
        assert.equal(result.timing, "Cold / candidate / saved: UNMEASURED / UNMEASURED / UNMEASURED");
        assert.ok(result.trace.includes(route));
        results.push(result);
      }
      assert.equal(results.at(-1).historyCount, "8 / 8 retained runs");
      return results;
    });

    await step("the ninth run is a focused recoverable error without history eviction", async () => {
      await compare();
      const result = await read();
      assert.match(result.error, /History is full/);
      assert.equal(result.focus, "input-error");
      assert.match(result.outcome, /^UNKNOWN — not compared/);
      assert.equal(result.historyCount, "8 / 8 retained runs");
      assert.match(result.history, /Run 1 \[synthetic\] · FAILURE/);
      assert.doesNotMatch(result.history, /Run 9/);
      return result;
    });

    await step("keyboard reset clears all results and errors without form.reset shadowing", async () => {
      await keyboardReset();
      const result = await read();
      assert.equal(result.historyCount, "0 / 8 retained runs");
      assert.equal(result.history, "");
      assert.equal(result.error, null);
      assert.equal(result.focus, "jvm-condition");
      assert.equal(await page.locator("#budget-ms").inputValue(), "200");
      for (const phase of ["jvm", "beans", "pool", "cache"]) {
        assert.equal(await page.locator(`#${phase}-condition`).inputValue(), "skipped");
      }
      assert.equal(await page.evaluate(() => typeof document.getElementById("warmup-form").reset), "function");
      return result;
    });

    await step("invalid budgets and injected choices clear stale success and add no checked run", async () => {
      await selectAll("primed");
      await page.selectOption("#prediction", "EXPOSE");
      await compare();
      assert.match((await read()).outcome, /^SUCCESS/);
      const rejected = [];
      for (const budget of ["49", "2001", "80.5", "2e2", ""]) {
        await page.locator("#budget-ms").fill(budget);
        const before = await read();
        assert.match(before.outcome, /^UNKNOWN — not compared/);
        assert.match(before.error, /Invalid configuration/);
        await compare();
        const result = await read();
        assert.equal(result.focus, "input-error");
        assert.equal(result.historyCount, "1 / 8 retained runs");
        assert.match(result.history, /Run 1 \[synthetic\] · SUCCESS/);
        rejected.push(result);
      }
      await page.locator("#budget-ms").fill("200");
      await page.locator("#jvm-condition").evaluate((select) => {
        const option = document.createElement("option");
        option.id = "invalid-test-option";
        option.value = "healthy";
        option.textContent = "Invalid test choice";
        select.append(option);
      });
      await page.selectOption("#jvm-condition", "healthy");
      await compare();
      const invalid = await read();
      assert.match(invalid.error, /Invalid configuration/);
      assert.equal(invalid.historyCount, "1 / 8 retained runs");
      assert.match(invalid.outcome, /^UNKNOWN — not compared/);
      await keyboardReset();
      await page.locator("#invalid-test-option").evaluate((node) => node.remove());
      const recovered = await read();
      assert.equal(recovered.error, null);
      assert.equal(recovered.focus, "jvm-condition");
      return { rejected, invalid, recovered };
    });

    await step("keyboard history details and the skip link are operable", async () => {
      await keyboardCompare();
      const summary = page.locator("#history summary").first();
      await summary.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#history details").first().getAttribute("open"), "");
      await page.locator(".skip-link").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.id), "exercise");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.id), "jvm-condition");
      return { historyOpen: true, focus: "jvm-condition", state: await read() };
    });

    await step("actual CSP denies inline script, inline handler and connection before the route guard", async () => {
      const csp = await page.evaluate(async () => {
        window.__s025Csp = { inline: false, handler: false, violations: [] };
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__s025Csp.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement("script");
        script.textContent = "window.__s025Csp.inline = true";
        document.head.append(script);
        const button = document.createElement("button");
        button.setAttribute("onclick", "window.__s025Csp.handler = true");
        document.body.append(button);
        button.click();
        script.remove();
        button.remove();
        try {
          await fetch("https://s025-csp.invalid/blocked");
          window.__s025Csp.fetch = "unexpected success";
        } catch (error) { window.__s025Csp.fetch = error.name; }
        return document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
      });
      await page.waitForFunction(() => {
        const directives = window.__s025Csp.violations.map((event) => event.directive);
        return ["script-src-elem", "script-src-attr", "connect-src"].every((directive) => directives.includes(directive));
      });
      const enforced = await page.evaluate(() => window.__s025Csp);
      assert.equal(enforced.inline, false);
      assert.equal(enforced.handler, false);
      assert.equal(enforced.fetch, "TypeError");
      assert.deepEqual(attemptedNetwork, []);
      assert.match(csp, /default-src 'none'.*connect-src 'none'/);
      await keyboardReset();
      await keyboardCompare();
      assert.match((await read()).verifier, /^Verifier PASS/);
      return { csp, enforced, requestsReachingRouteGuard: attemptedNetwork.length };
    });

    await step("ordinary operations have no page errors, unlabelled controls or external requests", async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(attemptedNetwork, []);
      assert.equal(hash(helper), helperSha256);
      const surface = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
        return {
          uniqueIds: new Set(ids).size === ids.length,
          labelledControls: [...document.querySelectorAll("select, input")].every((node) => node.labels.length > 0),
          liveRegion: document.getElementById("results").getAttribute("aria-live"),
          alert: document.getElementById("input-error").getAttribute("role")
        };
      });
      assert.deepEqual(surface, { uniqueIds: true, labelledControls: true, liveRegion: "polite", alert: "alert" });
      return { surface, pageErrors, attemptedNetwork };
    });
  } catch (error) {
    topLevelError = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        closeResolved = true;
      }
    } catch (error) {
      topLevelError = error.message;
      throw error;
    } finally {
      if (process.env.CAPTURE_BROWSER_EVIDENCE === "1") {
        const directory = path.join(lesson, "evidence");
        fs.mkdirSync(directory, { recursive: true });
        let index = 1;
        let file;
        do {
          file = path.join(directory, `browser-observations-${String(index++).padStart(3, "0")}.json`);
        } while (fs.existsSync(file));
        fs.writeFileSync(file, `${JSON.stringify({
          cardId: "A-S025", workerId: "worker-A-S025", mode: "synthetic-only",
          startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
          playwrightVersion, browserVersion: session?.browserVersion || null,
          helperSha256, helperPublishedCommit: "53c0c0d", topLevelError,
          observations, pageErrors, attemptedNetwork, awaitedFinallyCloseResolved: closeResolved,
          evidenceLimit: "Actual local DOM/keyboard/error/reset/failure/CSP checks only; no native Java/Azure, production Node24 or unattended lifecycle qualification."
        }, null, 2)}\n`, { flag: "wx" });
        console.log(`Browser observations: ${path.relative(repo, file)}`);
      }
    }
  }
});
