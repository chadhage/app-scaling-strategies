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
assert.equal(hash(helper), helperSha256, "Only the published 53c0c0d helper is qualified for this check.");
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;

test("S022 actual isolated DOM, keyboard, errors, history, reset and CSP", { timeout: 120000 }, async (t) => {
  assert.match(process.version, /^v22\./);
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
      try {
        observations.push({ name, passed: true, actual: await work() });
      } catch (error) {
        observations.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
  }
  try {
    session = await openIsolatedLesson("learning\\S022\\index.html");
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
      verifier: document.getElementById("verifier-result").textContent,
      counts: document.getElementById("counts-result").textContent,
      degradation: document.getElementById("degradation-result").textContent,
      historyCount: document.getElementById("history-count").textContent,
      history: document.getElementById("history").textContent,
      trace: document.getElementById("current-trace").textContent,
      rows: [...document.querySelectorAll("#dependency-rows tr")].map((row) => row.textContent),
      error: document.getElementById("input-error").hidden ? null : document.getElementById("input-error").textContent,
      focus: document.activeElement.id
    }));
    const submit = () => page.locator("#check-readiness").click();
    async function keyboardChoice(id, downs) {
      const control = page.locator(`#${id}`);
      await control.focus();
      await control.press("Home");
      for (let index = 0; index < downs; index++) await control.press("ArrowDown");
      await control.press("Tab");
    }

    await step("loadable offline surface is labelled and initially unchecked", async () => {
      assert.match(await page.title(), /^S022/);
      assert.equal(await page.locator(".training-banner").first().textContent(),
        "Training rehearsal - synthetic data - not a live Azure result");
      const result = await read();
      assert.match(result.readiness, /^UNKNOWN — not checked/);
      assert.equal(result.historyCount, "0 / 8 checked runs");
      assert.equal(result.rows.length, 4);
      assert.equal(result.error, null);
      return result;
    });

    await step("healthy required connections allow model permission, not a transition", async () => {
      await submit();
      const result = await read();
      assert.match(result.readiness, /^SUCCESS/);
      assert.match(result.decision, /ADMIT.*no traffic moved/);
      assert.match(result.verifier, /^Verifier PASS/);
      assert.match(result.counts, /success 4 · failure 0 · unknown 0.*3 \/ 3/);
      assert.match(await page.locator("#impact-result").textContent(), /UNMEASURED.*Zero user journeys/);
      return result;
    });

    await step("keyboard optional-cache outage preserves healthy capacity with a visible failure", async () => {
      await keyboardChoice("cache-condition", 1);
      assert.match((await read()).readiness, /^UNKNOWN — not checked/);
      await page.locator("#check-readiness").focus();
      await page.keyboard.press("Enter");
      const result = await read();
      assert.match(result.readiness, /^SUCCESS/);
      assert.match(result.verifier, /^Verifier PASS/);
      assert.match(result.counts, /success 3 · failure 1 · unknown 0.*3 \/ 3/);
      assert.match(result.degradation, /Optional cache degraded/);
      assert.match(result.rows[1], /Optional.*disconnected.*failure/);
      assert.match(result.trace, /fallback.*protected.*4\/4/i);
      return result;
    });

    await step("keyboard policy change makes the same failed cache required and invalidates stale PASS", async () => {
      await keyboardChoice("policy", 1);
      const pending = await read();
      assert.match(pending.readiness, /^UNKNOWN — not checked/);
      assert.equal(pending.historyCount, "2 / 8 checked runs");
      await keyboardChoice("prediction", 1);
      await page.locator("#check-readiness").focus();
      await page.keyboard.press("Enter");
      const result = await read();
      assert.match(result.readiness, /^FAILURE/);
      assert.match(result.decision, /HOLD/);
      assert.match(result.verifier, /^Verifier PASS/);
      assert.match(result.counts, /success 3 · failure 1 · unknown 0.*3 \/ 4/);
      assert.match(result.rows[1], /Required.*disconnected.*failure/);
      return result;
    });

    await step("wrong answer fails independently while disconnected required data stays blocked", async () => {
      await page.selectOption("#policy", "cache-optional");
      await page.selectOption("#cache-condition", "connected");
      await page.selectOption("#database-condition", "disconnected");
      await page.selectOption("#prediction", "ADMIT");
      await submit();
      const result = await read();
      assert.match(result.readiness, /^FAILURE/);
      assert.match(result.decision, /HOLD/);
      assert.match(result.verifier, /^Verifier FAIL/);
      assert.match(result.history, /Run 3 \[synthetic\].*FAILURE.*Run 4 \[synthetic\].*FAILURE/s);
      return result;
    });

    for (const [condition, age] of [["unknown", "5000"], ["missing", "unknown"], ["stale", "30001"]]) {
      await step(`required ${condition} is UNKNOWN and earlier failures remain retained`, async () => {
        await page.selectOption("#database-condition", condition);
        await page.selectOption("#prediction", "HOLD");
        await submit();
        const result = await read();
        assert.match(result.readiness, /^UNKNOWN — required/);
        assert.match(result.decision, /HOLD/);
        assert.match(result.verifier, /^Verifier PASS/);
        assert.match(result.counts, /success 3 · failure 0 · unknown 1/);
        assert.ok(result.rows[0].includes(`${condition}${age}unknown`));
        assert.match(result.history, /Run 4 \[synthetic\] · FAILURE/);
        return result;
      });
    }

    await step("optional unknown stays visible without an unqualified blanket veto", async () => {
      await page.selectOption("#database-condition", "connected");
      await page.selectOption("#cache-condition", "unknown");
      await page.selectOption("#prediction", "ADMIT");
      await submit();
      const result = await read();
      assert.match(result.readiness, /^SUCCESS/);
      assert.match(result.counts, /success 3 · failure 0 · unknown 1/);
      assert.equal(result.historyCount, "8 / 8 checked runs");
      return result;
    });

    await step("a ninth check is rejected without evicting failure or unknown history", async () => {
      const before = await read();
      await submit();
      const after = await read();
      assert.match(after.error, /History limit reached \(8\)/);
      assert.equal(after.history, before.history);
      assert.equal(after.historyCount, "8 / 8 checked runs");
      assert.equal(after.focus, "input-error");
      assert.match(after.readiness, /^UNKNOWN — not checked/);
      return after;
    });

    await step("forged browser-side model state is rejected without altering the UI", async () => {
      const before = await read();
      const actual = await page.evaluate(() => {
        const model = window.S022Readiness;
        const errors = [];
        const bad = model.createSession();
        bad.revision = -1;
        try { model.check(bad, "ADMIT"); } catch (error) { errors.push(error.message); }
        const forged = model.check(model.createSession(), "ADMIT");
        forged.history[0].result.counts.success = 99;
        try { model.configure(forged, model.DEFAULT_CONFIG); } catch (error) { errors.push(error.message); }
        return errors;
      });
      assert.equal(actual.length, 2);
      assert.ok(actual.every((error) => error.startsWith("Invalid session")));
      assert.equal((await read()).history, before.history);
      return actual;
    });

    await step("keyboard reset restores defaults, clears history/errors and restores focus", async () => {
      await page.locator("#reset-exercise").focus();
      await page.keyboard.press("Enter");
      const result = await read();
      assert.equal(result.historyCount, "0 / 8 checked runs");
      assert.equal(result.history, "");
      assert.equal(result.error, null);
      assert.equal(result.focus, "policy");
      assert.match(result.readiness, /^UNKNOWN — not checked/);
      assert.equal(await page.locator("#policy").inputValue(), "cache-optional");
      for (const id of ["database", "cache", "messaging", "service"]) {
        assert.equal(await page.locator(`#${id}-condition`).inputValue(), "connected");
      }
      assert.equal(await page.locator("#prediction").inputValue(), "ADMIT");
      assert.equal(await page.evaluate(() => typeof document.getElementById("lesson-controls").reset), "function");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.id), "database-condition");
      return result;
    });

    await step("invalid DOM input raises an accessible error and never records a successful default", async () => {
      await page.evaluate(() => {
        const select = document.getElementById("database-condition");
        const option = document.createElement("option");
        option.id = "invalid-test-option";
        option.value = "pretend-connected";
        option.textContent = "Invalid test input";
        select.append(option);
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const beforeSubmit = await read();
      assert.match(beforeSubmit.error, /Invalid configuration/);
      assert.equal(beforeSubmit.focus, "input-error");
      await submit();
      const result = await read();
      assert.equal(result.historyCount, "0 / 8 checked runs");
      assert.match(result.readiness, /^UNKNOWN — not checked/);
      assert.match(result.error, /Invalid configuration/);
      await page.locator("#reset-exercise").focus();
      await page.keyboard.press("Enter");
      assert.equal((await read()).error, null);
      assert.equal(await page.locator("#database-condition").inputValue(), "connected");
      await page.locator("#invalid-test-option").evaluate((node) => node.remove());
      return { beforeSubmit, rejectedSubmit: result, recovered: await read() };
    });

    await step("real CSP blocks inline code, inline handlers and connections before routing", async () => {
      const actual = await page.evaluate(async () => {
        window.__s022Csp = { inline: false, handler: false, violations: [] };
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__s022Csp.violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement("script");
        script.textContent = "window.__s022Csp.inline = true";
        document.head.append(script);
        const button = document.createElement("button");
        button.setAttribute("onclick", "window.__s022Csp.handler = true");
        document.body.append(button);
        button.click();
        button.remove();
        script.remove();
        try {
          await fetch("https://s022-csp.invalid/blocked");
          window.__s022Csp.fetch = "unexpected success";
        } catch (error) {
          window.__s022Csp.fetch = error.name;
        }
        return { csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content };
      });
      await page.waitForFunction(() => {
        const directives = window.__s022Csp.violations.map((event) => event.directive);
        return directives.includes("script-src-elem") && directives.includes("script-src-attr")
          && directives.includes("connect-src");
      });
      const enforced = await page.evaluate(() => window.__s022Csp);
      assert.equal(enforced.inline, false);
      assert.equal(enforced.handler, false);
      assert.equal(enforced.fetch, "TypeError");
      assert.deepEqual(attemptedNetwork, []);
      assert.match(actual.csp, /default-src 'none'.*script-src 'self'.*connect-src 'none'/);
      await submit();
      assert.match((await read()).readiness, /^SUCCESS/);
      return { ...actual, enforced, routedExternalRequests: attemptedNetwork.length };
    });

    await step("all ordinary interactions remain error-free and network-free", async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(attemptedNetwork, []);
      assert.equal(hash(helper), helperSha256);
      const narrow = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
        return { uniqueIds: new Set(ids).size === ids.length,
          controlsLabelled: [...document.querySelectorAll("select")].every((node) => node.labels.length > 0) };
      });
      assert.deepEqual(narrow, { uniqueIds: true, controlsLabelled: true });
      return { ...narrow, pageErrors, attemptedNetwork };
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
    } finally {
      if (process.env.CAPTURE_BROWSER_EVIDENCE === "1") {
        const directory = path.join(lesson, "evidence");
        let index = 1;
        let file;
        do {
          file = path.join(directory, `browser-observations-${String(index++).padStart(3, "0")}.json`);
        } while (fs.existsSync(file));
        const record = {
          cardId: "A-S022", workerId: "worker-A-S022", mode: "synthetic-only",
          startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
          playwrightVersion, browserVersion: session?.browserVersion || null,
          helperSha256, helperPublishedCommit: "53c0c0d", topLevelError, observations,
          pageErrors, attemptedNetwork, awaitedFinallyCloseResolved: closeResolved,
          evidenceLimit: "Actual local DOM and CSP enforcement only; not native Azure, Node24 or production behavior."
        };
        fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
        console.log(`Browser observations: ${path.relative(repo, file)}`);
      }
    }
  }
});
