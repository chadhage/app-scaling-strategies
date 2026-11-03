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

test("S026 actual isolated DOM, keyboard, error, reset, failure and CSP", { timeout: 120000 }, async (t) => {
  assert.match(process.version, /^v22\./);
  assert.equal(playwrightVersion, "1.56.1");
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const pageErrors = [];
  const attemptedNetwork = [];
  let session;
  let awaitedFinallyCloseResolved = false;
  let topLevelError = null;
  let cleanupError = null;
  async function step(name, work) {
    await t.test(name, async () => {
      try {
        observations.push({ name, passed: true, actual: await work() });
      } catch (error) {
        observations.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
  }
  try {
    session = await openIsolatedLesson("learning\\S026\\index.html");
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
      outcome: document.getElementById("outcome-result").textContent,
      permission: document.getElementById("permission-result").textContent,
      verifier: document.getElementById("verifier-result").textContent,
      checks: document.getElementById("checks-result").textContent,
      traffic: document.getElementById("traffic-result").textContent,
      impact: document.getElementById("impact-result").textContent,
      trace: document.getElementById("current-trace").textContent,
      historyCount: document.getElementById("history-count").textContent,
      summaries: [...document.querySelectorAll("#history summary")].map((node) => node.textContent),
      error: document.getElementById("input-error").hidden ? null : document.getElementById("input-error").textContent,
      focus: document.activeElement.id
    }));
    const submit = () => page.locator("#check-handoff").click();
    async function keyboardChoice(id, downs) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < downs; index++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
    }

    await step("offline surface has exact banner and no invented initial evidence", async () => {
      assert.match(await page.title(), /^S026/);
      assert.equal(await page.locator(".training-banner").textContent(),
        "Training rehearsal - synthetic data - not a live Azure result");
      const actual = await read();
      assert.equal(actual.outcome, "UNKNOWN — not checked");
      assert.equal(actual.historyCount, "0 / 8 checked runs");
      assert.equal(actual.error, null);
      return actual;
    });

    await step("keyboard delayed image pull retains all six requests on GA", async () => {
      await keyboardChoice("pull-ticks", 2);
      await keyboardChoice("observe-tick", 1);
      await page.locator("#check-handoff").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.match(actual.outcome, /^UNKNOWN/);
      assert.match(actual.permission, /^HOLD.*ga-v1/);
      assert.match(actual.verifier, /^Verifier PASS/);
      assert.match(actual.checks, /success 0 · failure 0 · unknown 2/);
      assert.match(actual.traffic, /success 6 · failure 0 · unknown 0; GA 6 · candidate 0/);
      assert.match(actual.trace, /PULLING.*ready false.*serving ga-v1/);
      return actual;
    });

    await step("pulled but still initializing is not ready and changing controls invalidates the display", async () => {
      await page.selectOption("#pull-ticks", "1");
      assert.equal((await read()).outcome, "UNKNOWN — not checked");
      assert.equal((await read()).historyCount, "1 / 8 checked runs");
      await page.selectOption("#startup-ticks", "3");
      await page.selectOption("#observe-tick", "3");
      await submit();
      const actual = await read();
      assert.match(actual.outcome, /^UNKNOWN/);
      assert.match(actual.checks, /success 1 · failure 0 · unknown 1/);
      assert.match(actual.trace, /t=3.*INITIALIZING.*pull success.*init unknown.*serving ga-v1/);
      assert.match(actual.traffic, /GA 12 · candidate 0/);
      return actual;
    });

    await step("successful initialization alone unlocks the selected handoff tick", async () => {
      await page.selectOption("#observe-tick", "4");
      await keyboardChoice("prediction", 1);
      await page.locator("#check-handoff").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.match(actual.outcome, /^SUCCESS/);
      assert.match(actual.permission, /^ALLOW.*candidate-v2/);
      assert.match(actual.verifier, /^Verifier PASS/);
      assert.match(actual.checks, /success 2 · failure 0 · unknown 0/);
      assert.match(actual.traffic, /success 15 · failure 0 · unknown 0; GA 12 · candidate 3/);
      const rows = actual.trace.split("\n");
      assert.ok(rows.slice(0, -1).every((row) => row.includes("serving ga-v1")));
      assert.match(rows.at(-1), /t=4.*READY.*init success.*ready true.*serving candidate-v2/);
      assert.match(actual.impact, /synthetic.*UNMEASURED.*not native/);
      return actual;
    });

    await step("failed immutable pull is visible while every synthetic request stays on GA", async () => {
      await page.selectOption("#pull-ticks", "2");
      await page.selectOption("#startup-ticks", "2");
      await page.selectOption("#fault", "pull-failure");
      await page.selectOption("#observe-tick", "2");
      await page.selectOption("#prediction", "HOLD");
      await submit();
      const actual = await read();
      assert.match(actual.outcome, /^FAILURE/);
      assert.match(actual.verifier, /^Verifier PASS/);
      assert.match(actual.checks, /success 0 · failure 1 · unknown 1/);
      assert.match(actual.traffic, /GA 9 · candidate 0/);
      assert.match(actual.trace, /PULL FAILED.*ready false.*serving ga-v1/);
      return actual;
    });

    await step("failed initialization does not admit users after a successful pull", async () => {
      await page.selectOption("#fault", "startup-failure");
      await page.selectOption("#observe-tick", "4");
      await submit();
      const actual = await read();
      assert.match(actual.outcome, /^FAILURE/);
      assert.match(actual.checks, /success 1 · failure 1 · unknown 0/);
      assert.match(actual.traffic, /success 15 · failure 0 · unknown 0; GA 15 · candidate 0/);
      assert.match(actual.trace, /STARTUP FAILED.*pull success.*init failure.*serving ga-v1/);
      return actual;
    });

    await step("wrong operator answer is FAIL, never a forced handoff", async () => {
      await page.selectOption("#prediction", "ALLOW");
      await submit();
      const actual = await read();
      assert.match(actual.outcome, /^FAILURE/);
      assert.match(actual.permission, /^HOLD/);
      assert.match(actual.verifier, /^Verifier FAIL/);
      assert.match(actual.traffic, /GA 15 · candidate 0/);
      return actual;
    });

    await step("missing observations remain UNKNOWN at tick six and retain prior failure evidence", async () => {
      await page.selectOption("#fault", "unobserved");
      await page.selectOption("#observe-tick", "6");
      await page.selectOption("#prediction", "HOLD");
      await submit();
      const actual = await read();
      assert.match(actual.outcome, /^UNKNOWN/);
      assert.match(actual.verifier, /^Verifier PASS/);
      assert.match(actual.checks, /success 0 · failure 0 · unknown 2/);
      assert.match(actual.traffic, /GA 21 · candidate 0/);
      assert.match(actual.summaries[3], /Run 4.*FAILURE.*pull-failure/);
      assert.match(actual.summaries[2], /Run 3.*SUCCESS.*tick 4/);
      assert.equal(actual.historyCount, "7 / 8 checked runs");
      return actual;
    });

    await step("keyboard history details retain trace and the ninth run is rejected without eviction", async () => {
      await submit();
      await page.locator("#history summary").first().focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#history details").first().evaluate((node) => node.open), true);
      assert.match(await page.locator("#history pre").first().textContent(), /PULLING.*serving ga-v1/);
      const before = await read();
      await submit();
      const actual = await read();
      assert.equal(actual.historyCount, "8 / 8 checked runs");
      assert.deepEqual(actual.summaries, before.summaries);
      assert.match(actual.error, /History limit/);
      assert.equal(actual.focus, "input-error");
      assert.equal(actual.outcome, "UNKNOWN — not checked");
      return actual;
    });

    await step("keyboard reset clears all history and errors, restores defaults and focuses pull control", async () => {
      await page.locator("#restart-lesson").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.equal(actual.historyCount, "0 / 8 checked runs");
      assert.deepEqual(actual.summaries, []);
      assert.equal(actual.error, null);
      assert.equal(actual.focus, "pull-ticks");
      assert.equal(actual.outcome, "UNKNOWN — not checked");
      assert.equal(await page.locator("#pull-ticks").inputValue(), "2");
      assert.equal(await page.locator("#startup-ticks").inputValue(), "2");
      assert.equal(await page.locator("#observe-tick").inputValue(), "3");
      assert.equal(await page.locator("#fault").inputValue(), "none");
      assert.equal(await page.locator("#prediction").inputValue(), "HOLD");
      assert.equal(await page.evaluate(() => typeof document.getElementById("exercise-form").reset), "function");
      return actual;
    });

    await step("malformed DOM input receives a focused error without a record and reset recovers", async () => {
      await page.evaluate(() => {
        const select = document.getElementById("pull-ticks");
        const option = document.createElement("option");
        option.id = "invalid-test-option";
        option.value = "2.5";
        option.textContent = "Invalid test input";
        select.append(option);
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      assert.match((await read()).error, /Invalid configuration/);
      await submit();
      const rejected = await read();
      assert.equal(rejected.historyCount, "0 / 8 checked runs");
      assert.equal(rejected.focus, "input-error");
      assert.match(rejected.error, /Invalid configuration/);
      await page.locator("#restart-lesson").focus();
      await page.keyboard.press("Enter");
      await page.locator("#invalid-test-option").evaluate((node) => node.remove());
      const recovered = await read();
      assert.equal(recovered.error, null);
      assert.equal(recovered.focus, "pull-ticks");
      return { rejected, recovered };
    });

    await step("real CSP denies inline script, inline handler and connection before the route guard", async () => {
      const csp = await page.evaluate(async () => {
        window.__s026Csp = { inline: false, handler: false, violations: [] };
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__s026Csp.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement("script");
        script.textContent = "window.__s026Csp.inline = true";
        document.head.append(script);
        const button = document.createElement("button");
        button.setAttribute("onclick", "window.__s026Csp.handler = true");
        document.body.append(button);
        button.click();
        button.remove();
        script.remove();
        try {
          await fetch("https://s026-csp.invalid/blocked");
          window.__s026Csp.fetch = "unexpected success";
        } catch (error) {
          window.__s026Csp.fetch = error.name;
        }
        return document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
      });
      await page.waitForFunction(() => {
        const directives = window.__s026Csp.violations.map((event) => event.directive);
        return ["script-src-elem", "script-src-attr", "connect-src"].every((item) => directives.includes(item));
      });
      const enforced = await page.evaluate(() => window.__s026Csp);
      assert.equal(enforced.inline, false);
      assert.equal(enforced.handler, false);
      assert.equal(enforced.fetch, "TypeError");
      assert.deepEqual(attemptedNetwork, []);
      assert.match(csp, /default-src 'none'.*script-src 'self'.*connect-src 'none'/);
      await submit();
      assert.match((await read()).verifier, /^Verifier PASS/);
      return { csp, enforced, routedExternalRequests: attemptedNetwork.length };
    });

    await step("ordinary interactions have no page errors, remote requests or unlabelled controls", async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(attemptedNetwork, []);
      assert.equal(hash(helper), helperSha256);
      await page.setViewportSize({ width: 375, height: 812 });
      const actual = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
        return {
          uniqueIds: new Set(ids).size === ids.length,
          controlsLabelled: [...document.querySelectorAll("select")].every((node) => node.labels.length > 0),
          noHorizontalPageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          skipTarget: document.querySelector(".skip").getAttribute("href")
        };
      });
      assert.deepEqual(actual, {
        uniqueIds: true, controlsLabelled: true, noHorizontalPageOverflow: true, skipTarget: "#exercise"
      });
      return { ...actual, pageErrors, attemptedNetwork };
    });
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
        const directory = path.join(root, "evidence");
        let index = 1;
        let file;
        do { file = path.join(directory, `browser-observations-${String(index++).padStart(3, "0")}.json`); } while (fs.existsSync(file));
        const record = {
          cardId: "A-S026", workerId: "worker-A-S026", packet: "SC-S026", mode: "synthetic-only",
          startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
          playwrightVersion, browserVersion: session?.browserVersion || null,
          helperSha256, helperPublishedCommit: "53c0c0d", topLevelError, cleanupError,
          observations, pageErrors, attemptedNetwork, awaitedFinallyCloseResolved,
          limits: "Actual local DOM and CSP enforcement only; not native Azure, Node24 or production behavior. Known helper lifecycle limitation remains."
        };
        fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
        console.log(`Browser observations: ${path.relative(repo, file)}`);
      }
    }
  }
});
