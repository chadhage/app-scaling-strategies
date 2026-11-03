"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const helper = path.join(repo, "testing", "browser", "isolated.cjs");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const helperSha256 = "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055";
assert.equal(digest(fs.readFileSync(helper)), helperSha256, "Only published helper 53c0c0d is qualified.");
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;

test("S030 actual isolated DOM, keyboard, error, reset, failure and CSP", { timeout: 120000 }, async (t) => {
  assert.equal(process.version, "v22.23.4");
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
      try { observations.push({ name, passed: true, actual: await work() }); }
      catch (error) {
        observations.push({ name, passed: false, error: error.message });
        throw error;
      }
    });
  }
  try {
    session = await openIsolatedLesson("learning\\S030\\index.html");
    assert.equal(session.browserVersion, "156.0.4314.50");
    const page = session.page;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).protocol === "file:") return route.continue();
      attemptedNetwork.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.reload({ waitUntil: "load" });
    const read = () => page.evaluate(() => ({
      status: document.getElementById("status").textContent,
      visible: !document.getElementById("current-result").hidden,
      outcome: document.getElementById("bounded-outcome").textContent,
      verifier: document.getElementById("answer-verifier").textContent,
      simultaneous: document.querySelector("#current-comparison .simultaneous")?.textContent || "",
      bounded: document.querySelector("#current-comparison .bounded")?.textContent || "",
      historyCount: document.getElementById("history-count").textContent,
      history: document.getElementById("history").textContent,
      summaries: [...document.querySelectorAll("#history summary")].map((node) => node.textContent),
      error: document.getElementById("input-error").hidden ? null : document.getElementById("input-error").textContent,
      focus: document.activeElement.id
    }));
    const submit = () => page.locator("#check-comparison").click();
    async function keyboardChoice(id, downs) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < downs; index++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
    }

    await step("offline initial surface has exact banner and no invented evidence", async () => {
      assert.equal(await page.title(), "S030 — Warm-up overload");
      assert.equal(await page.locator(".training-banner").textContent(),
        "Training rehearsal - synthetic data - not a live Azure result");
      const actual = await read();
      assert.equal(actual.visible, false);
      assert.equal(actual.status, "Not run — no evidence yet.");
      assert.equal(actual.historyCount, "0 / 8 comparisons");
      assert.equal(actual.error, null);
      return actual;
    });

    await step("skip link, native numeric keyboard input and Enter conduct the default comparison", async () => {
      await page.locator(".skip").focus();
      await page.keyboard.press("Enter");
      assert.equal((await read()).focus, "exercise");
      await page.keyboard.press("Tab");
      assert.equal((await read()).focus, "candidate-count");
      await page.keyboard.press("Control+A");
      await page.keyboard.type("6");
      await page.locator("#check-comparison").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.equal(actual.outcome, "Bounded outcome: SUCCESS");
      assert.match(actual.verifier, /^Verifier PASS/);
      assert.match(actual.simultaneous, /simultaneous: FAILURE/);
      assert.match(actual.simultaneous, /database: capacity 8; peak load 16; overloaded ticks 2/);
      assert.match(actual.simultaneous, /cache: capacity 6; peak load 10; overloaded ticks 2/);
      assert.match(actual.simultaneous, /GA journeys attempted 8: success 0 \/ failure 8 \/ unknown 0/);
      assert.match(actual.bounded, /duration 6 ticks; planned 6; budget 8; within budget true/);
      assert.match(actual.bounded, /database: capacity 8; peak load 8; overloaded ticks 0/);
      assert.match(actual.bounded, /GA journeys attempted 24: success 24 \/ failure 0 \/ unknown 0/);
      assert.match(actual.status, /Synthetic only; real users UNMEASURED/);
      return actual;
    });

    await step("history expands by keyboard and changing controls invalidates only the current result", async () => {
      const firstSummary = page.locator("#history summary").first();
      await firstSummary.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#history details").first().getAttribute("open"), "");
      const before = (await read()).history;
      await page.fill("#bounded-limit", "3");
      const actual = await read();
      assert.equal(actual.visible, false);
      assert.equal(actual.history, before);
      assert.equal(actual.historyCount, "1 / 8 comparisons");
      assert.match(actual.status, /retained evidence is unchanged/);
      return actual;
    });

    await step("unsafe bound and incorrect success answer expose failed initialization and journeys", async () => {
      await submit();
      const actual = await read();
      assert.equal(actual.outcome, "Bounded outcome: FAILURE");
      assert.match(actual.verifier, /^Verifier FAIL/);
      assert.match(actual.bounded, /duration 4 ticks/);
      assert.match(actual.bounded, /Initialization attempted 6: success 0 \/ failure 6 \/ unknown 0/);
      assert.match(actual.bounded, /GA journeys attempted 16: success 0 \/ failure 16 \/ unknown 0/);
      assert.match(actual.bounded, /database \+ cache/);
      assert.match(actual.bounded, /max latency 250 ms \/ budget 100 ms/);
      return actual;
    });

    await step("keyboard expected-failure answer passes its verifier without relabelling interruption", async () => {
      await keyboardChoice("prediction", 1);
      await page.locator("#check-comparison").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.equal(actual.outcome, "Bounded outcome: FAILURE");
      assert.match(actual.verifier, /^Verifier PASS — predicted FAILURE/);
      assert.equal(actual.historyCount, "3 / 8 comparisons");
      return actual;
    });

    await step("small bound misses preparation budget even with successful GA journeys", async () => {
      await page.fill("#bounded-limit", "1");
      await submit();
      const actual = await read();
      assert.equal(actual.outcome, "Bounded outcome: FAILURE");
      assert.match(actual.bounded, /duration 12 ticks; planned 12; budget 8; within budget false/);
      assert.match(actual.bounded, /peak load 6; overloaded ticks 0/);
      assert.match(actual.bounded, /GA journeys attempted 48: success 48 \/ failure 0 \/ unknown 0/);
      assert.match(actual.verifier, /^Verifier PASS/);
      return actual;
    });

    await step("missing observations display unknown loads, duration, initialization and journeys", async () => {
      await keyboardChoice("observations", 1);
      await keyboardChoice("prediction", 2);
      await submit();
      const actual = await read();
      assert.equal(actual.outcome, "Bounded outcome: UNKNOWN");
      assert.match(actual.verifier, /^Verifier PASS — predicted UNKNOWN/);
      assert.match(actual.bounded, /duration UNKNOWN ticks; planned 12/);
      assert.match(actual.bounded, /peak load UNKNOWN; overloaded ticks UNKNOWN/);
      assert.match(actual.bounded, /Initialization attempted 6: success 0 \/ failure 0 \/ unknown 6/);
      assert.match(actual.bounded, /GA journeys attempted 48: success 0 \/ failure 0 \/ unknown 48/);
      return actual;
    });

    await step("invalid numeric and forged select inputs focus a real alert without changing history", async () => {
      const before = (await read()).history;
      const errors = [];
      for (const value of ["", "1.5", "13", "1e1"]) {
        await page.fill("#candidate-count", value);
        await submit();
        const actual = await read();
        assert.ok(actual.error, value);
        assert.equal(actual.focus, "input-error");
        assert.equal(actual.visible, false);
        assert.equal(actual.history, before);
        errors.push({ input: value, error: actual.error });
      }
      await page.fill("#candidate-count", "6");
      await page.fill("#bounded-limit", "7");
      await submit();
      assert.match((await read()).error, /concurrency/);
      await page.fill("#bounded-limit", "2");
      await page.evaluate(() => {
        const select = document.getElementById("observations");
        select.value = "forged";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await submit();
      const actual = await read();
      assert.match(actual.error, /observations/);
      assert.equal(actual.history, before);
      assert.equal(actual.historyCount, "5 / 8 comparisons");
      return { errors, final: actual };
    });

    await step("a corrected successful comparison retains every earlier failed and unknown run", async () => {
      await page.selectOption("#observations", "complete");
      await page.selectOption("#prediction", "SUCCESS");
      await submit();
      const actual = await read();
      assert.equal(actual.outcome, "Bounded outcome: SUCCESS");
      assert.equal(actual.error, null);
      assert.equal(actual.historyCount, "6 / 8 comparisons");
      assert.match(actual.summaries[1], /bounded FAILURE; answer SUCCESS; verifier FAIL/);
      assert.match(actual.summaries[3], /bounded FAILURE; answer FAILURE; verifier PASS/);
      assert.match(actual.summaries[4], /bounded UNKNOWN; answer UNKNOWN; verifier PASS/);
      return actual;
    });

    await step("eight retained comparisons fit and the ninth is rejected without eviction", async () => {
      await submit();
      await submit();
      const before = await read();
      assert.equal(before.historyCount, "8 / 8 comparisons");
      await submit();
      const actual = await read();
      assert.match(actual.error, /eight comparisons/);
      assert.equal(actual.focus, "input-error");
      assert.equal(actual.history, before.history);
      assert.equal(actual.historyCount, "8 / 8 comparisons");
      return actual;
    });

    await step("keyboard reset restores defaults, clears errors and history, and avoids form.reset shadowing", async () => {
      await page.locator("#clear-history").focus();
      await page.keyboard.press("Enter");
      const actual = await read();
      assert.equal(actual.historyCount, "0 / 8 comparisons");
      assert.equal(actual.history, "");
      assert.equal(actual.error, null);
      assert.equal(actual.visible, false);
      assert.equal(actual.focus, "candidate-count");
      const defaults = await page.evaluate(() => ({
        values: ["candidate-count", "bounded-limit", "db-capacity", "cache-capacity", "init-budget", "observations", "prediction"]
          .map((id) => document.getElementById(id).value),
        resetMethod: typeof document.getElementById("comparison-form").reset
      }));
      assert.deepEqual(defaults, { values: ["6", "2", "8", "6", "8", "complete", "SUCCESS"], resetMethod: "function" });
      return { actual, defaults };
    });

    await step("reload clears memory-only evidence rather than presenting it as durable", async () => {
      await submit();
      assert.equal((await read()).historyCount, "1 / 8 comparisons");
      await page.reload({ waitUntil: "load" });
      const actual = await read();
      assert.equal(actual.historyCount, "0 / 8 comparisons");
      assert.equal(actual.visible, false);
      assert.equal(actual.status, "Not run — no evidence yet.");
      return actual;
    });

    await step("narrow viewport keeps the page bounded and provides a keyboard-scrollable trace", async () => {
      await page.setViewportSize({ width: 360, height: 800 });
      await submit();
      await page.locator("#candidate-count").focus();
      await page.keyboard.press("Tab");
      const actual = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        traceScrollable: [...document.querySelectorAll(".table-scroll")].every((node) => node.tabIndex === 0 && node.getAttribute("aria-label")),
        focus: document.activeElement.id,
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle
      }));
      assert.ok(actual.pageWidth <= actual.viewport);
      assert.equal(actual.traceScrollable, true);
      assert.equal(actual.focus, "bounded-limit");
      assert.equal(actual.outlineStyle, "solid");
      return actual;
    });

    await step("actual browser CSP blocks inline code, external requests, workers, base changes and forms before routing", async () => {
      await page.evaluate(() => {
        globalThis.__s030Csp = [];
        globalThis.__s030Inline = false;
        globalThis.__s030Handler = false;
        document.addEventListener("securitypolicyviolation", (event) => {
          globalThis.__s030Csp.push({ directive: event.effectiveDirective, blocked: event.blockedURI, disposition: event.disposition });
        });
        const inline = document.createElement("script");
        inline.textContent = "globalThis.__s030Inline = true;";
        document.body.append(inline);
        const handler = document.createElement("button");
        handler.type = "button";
        handler.setAttribute("onclick", "globalThis.__s030Handler = true");
        document.body.append(handler);
        handler.click();
        const style = document.createElement("style");
        style.textContent = "body { display: none; }";
        document.head.append(style);
        const remote = document.createElement("script");
        remote.src = "https://s030.invalid/code.js";
        document.body.append(remote);
        fetch("https://s030.invalid/collect").catch(() => {});
        const image = document.createElement("img");
        image.src = "https://s030.invalid/image.png";
        document.body.append(image);
        const frame = document.createElement("iframe");
        frame.src = "https://s030.invalid/frame";
        document.body.append(frame);
        const object = document.createElement("object");
        object.data = "https://s030.invalid/object";
        document.body.append(object);
        const workerUrl = URL.createObjectURL(new Blob(["self.postMessage('must not run');"], { type: "text/javascript" }));
        try {
          const worker = new Worker(workerUrl);
          worker.onerror = (event) => event.preventDefault();
        } catch {} finally {
          URL.revokeObjectURL(workerUrl);
        }
        const base = document.createElement("base");
        base.href = "https://s030.invalid/";
        document.head.append(base);
        const form = document.createElement("form");
        form.action = "https://s030.invalid/submit";
        document.body.append(form);
        HTMLFormElement.prototype.submit.call(form);
      });
      try {
        await page.waitForFunction(() => {
          const seen = new Set(globalThis.__s030Csp.map((item) => item.directive));
          return ["script-src-elem", "script-src-attr", "style-src-elem", "connect-src", "img-src", "frame-src", "object-src", "worker-src", "base-uri", "form-action"]
            .every((directive) => seen.has(directive));
        });
      } catch (error) {
        error.message += ` Actual violations: ${JSON.stringify(await page.evaluate(() => globalThis.__s030Csp))}`;
        throw error;
      }
      const actual = await page.evaluate(() => ({
        inlineExecuted: globalThis.__s030Inline, handlerExecuted: globalThis.__s030Handler,
        violations: globalThis.__s030Csp, bodyVisible: getComputedStyle(document.body).display !== "none",
        locationProtocol: location.protocol
      }));
      assert.equal(actual.inlineExecuted, false);
      assert.equal(actual.handlerExecuted, false);
      assert.equal(actual.bodyVisible, true);
      assert.equal(actual.locationProtocol, "file:");
      assert.ok(actual.violations.every((item) => item.disposition === "enforce"));
      assert.deepEqual(attemptedNetwork, []);
      assert.deepEqual(pageErrors, []);
      return { ...actual, routeGuardExternalRequests: attemptedNetwork.length };
    });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(attemptedNetwork, []);
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
        fs.writeFileSync(file, `${JSON.stringify({
          cardId: "A-S030", workerId: "worker-A-S030", packet: "SC-S030",
          startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
          playwrightVersion, browserVersion: session?.browserVersion || null,
          helperSha256, helperPublishedCommit: "53c0c0d",
          sources: ["warmup.js", "app.js", "index.html", "styles.css", "warmup.feature", "tests\\browser.test.cjs"]
            .map((local) => ({ path: `learning\\S030\\${local}`, sha256: digest(fs.readFileSync(path.join(root, local))) })),
          observations, pageErrors, attemptedNetwork, topLevelError, cleanupError, awaitedFinallyCloseResolved,
          limit: "Published helper has a documented unattended lifecycle limitation; the abandoned prototype is not qualified."
        }, null, 2)}\n`, { flag: "wx" });
      }
    }
  }
});
