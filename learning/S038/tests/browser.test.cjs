"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { hashes, digest } = require("../capture.cjs");
const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "..", "..");
const helper = path.join(repo, "testing", "browser", "isolated.cjs");
assert.equal(digest(fs.readFileSync(helper)), "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, "testing", "browser", "node_modules", "playwright", "package.json")).version;

test("S038 actual isolated browser: DOM, keyboard, errors, history, bounds, reset and CSP", { timeout: 150000 }, async (t) => {
  assert.equal(process.version, "v22.23.4", "Qualified local test tooling only.");
  assert.equal(playwrightVersion, "1.56.1");
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const pageErrors = [];
  const networkAttempts = [];
  let session;
  let browserVersion = null;
  let awaitedFinallyClose = false;
  let lifecycleError = null;
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
    session = await openIsolatedLesson("learning\\S038\\index.html");
    browserVersion = session.browserVersion;
    assert.equal(browserVersion, "156.0.4314.50");
    const page = session.page;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (new URL(url).protocol === "file:") return route.continue();
      networkAttempts.push(url);
      return route.abort("blockedbyclient");
    });
    await page.reload({ waitUntil: "load" });
    const read = () => page.evaluate(() => ({
      summary: document.getElementById("result-summary").textContent,
      visible: !document.getElementById("current-result").hidden,
      status: document.getElementById("status").textContent,
      historyCount: document.getElementById("history-count").textContent,
      history: [...document.querySelectorAll("#history summary")].map((node) => node.textContent),
      rows: [...document.querySelectorAll("#current-trace tbody tr")].map((row) => ({
        outcome: row.dataset.outcome,
        cells: [...row.querySelectorAll("td")].map((cell) => cell.textContent)
      })),
      error: document.getElementById("input-error").hidden ? null : document.getElementById("input-error").textContent,
      focus: document.activeElement.id,
      full: document.getElementById("conduct").disabled
    }));
    async function choose(id, offset) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < offset; index++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
    }
    async function conduct() {
      await page.locator("#conduct").focus();
      await page.keyboard.press("Enter");
      return read();
    }
    async function reset() {
      await page.locator("#reset-lesson").focus();
      await page.keyboard.press("Enter");
      return read();
    }
    async function toggle(id) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press("Space");
    }

    await step("offline initial surface has exact banner, source labels and no fabricated results", async () => {
      assert.equal(await page.title(), "S038 — Tenant authorization continuity");
      assert.equal(await page.locator(".training-banner").textContent(), "Training rehearsal - synthetic data - not a live Azure result");
      assert.match(await page.locator("header").textContent(), /A-S038.*D-S038.*SC-S038/);
      const actual = await read();
      assert.equal(actual.visible, false);
      assert.equal(actual.status, "Not run — no evidence yet.");
      assert.equal(actual.historyCount, "0 / 6 runs");
      assert.equal(actual.rows.length, 0);
      return actual;
    });

    await step("skip navigation, native select arrows and Enter conduct all 16 default probes", async () => {
      await page.locator(".skip").focus();
      await page.keyboard.press("Enter");
      assert.equal((await read()).focus, "exercise");
      await page.keyboard.press("Tab");
      assert.equal((await read()).focus, "route-alba");
      await choose("route-alba", 1);
      await choose("route-birch", 1);
      const actual = await conduct();
      assert.match(actual.summary, /SUCCESS; verifier PASS/);
      assert.match(actual.summary, /attempted 16: success 16 \/ failure 0 \/ unknown 0/);
      assert.match(actual.summary, /Observed authorized v2 route reads: 2 \/ 2/);
      assert.equal(actual.rows.length, 16);
      assert.equal(actual.rows.filter((row) => row.cells[0].includes("before")).length, 8);
      assert.equal(actual.rows.filter((row) => row.cells[4].includes("403; data tenant none; no record")).length, 8);
      assert.equal(actual.rows.filter((row) => row.outcome === "success").length, 16);
      return actual;
    });

    await step("keyboard history details retain failure evidence when controls invalidate the current view", async () => {
      await page.locator("#history summary").first().focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#history details").first().getAttribute("open"), "");
      const firstHistory = await page.locator("#history").textContent();
      await choose("policy", 1);
      const invalidated = await read();
      assert.equal(invalidated.visible, false);
      assert.equal(await page.locator("#history").textContent(), firstHistory);
      const actual = await conduct();
      assert.match(actual.summary, /FAILURE; verifier FAIL/);
      assert.match(actual.summary, /success 14 \/ failure 2 \/ unknown 0/);
      const failures = actual.rows.filter((row) => row.outcome === "failure");
      assert.equal(failures.length, 2);
      failures.forEach((row) => {
        assert.match(row.cells[0], /after/);
        assert.match(row.cells[1], /v2/);
        assert.match(row.cells[2], /foreign/);
        assert.match(row.cells[4], /200; data tenant (alba|birch); synthetic-record-/);
        assert.match(row.cells[5], /rejectForeign: fail/);
      });
      assert.equal(actual.historyCount, "2 / 6 runs");
      return actual;
    });

    await step("omitting the foreign-rejection assertion leaves eight unknowns, not an isolation pass", async () => {
      await toggle("reject-foreign");
      const actual = await conduct();
      assert.match(actual.summary, /UNKNOWN; verifier UNVERIFIED/);
      assert.match(actual.summary, /success 8 \/ failure 0 \/ unknown 8/);
      assert.equal(actual.rows.filter((row) => row.outcome === "unknown").length, 8);
      assert.equal(actual.rows.filter((row) => row.cells[5] === "rejectForeign: unselected").length, 8);
      assert.ok(actual.history[1].includes("FAILURE"));
      return actual;
    });

    await step("correct status with the wrong tenant's data fails the data isolation assertion", async () => {
      await toggle("reject-foreign");
      await choose("policy", 2);
      const actual = await conduct();
      assert.match(actual.summary, /FAILURE; verifier FAIL/);
      assert.match(actual.summary, /success 14 \/ failure 2 \/ unknown 0/);
      actual.rows.filter((row) => row.outcome === "failure").forEach((row) => {
        assert.match(row.cells[2], /\(own\)/);
        assert.match(row.cells[4], /^200;/);
        assert.match(row.cells[5], /ownRead: pass; dataTenant: fail/);
      });
      return actual;
    });

    await step("denying authorized own reads also breaks continuity without hiding correct foreign denials", async () => {
      await choose("policy", 3);
      const actual = await conduct();
      assert.match(actual.summary, /success 14 \/ failure 2 \/ unknown 0/);
      actual.rows.filter((row) => row.outcome === "failure").forEach((row) => {
        assert.match(row.cells[2], /\(own\)/);
        assert.match(row.cells[4], /^403;/);
        assert.match(row.cells[5], /ownRead: fail; dataTenant: fail/);
      });
      return actual;
    });

    await step("unobserved responses remain unknown and six-run capacity rejects rather than evicts", async () => {
      await choose("policy", 4);
      let actual = await conduct();
      assert.match(actual.summary, /UNKNOWN; verifier UNVERIFIED/);
      assert.match(actual.summary, /success 12 \/ failure 0 \/ unknown 4/);
      assert.match(actual.summary, /Observed authorized v2 route reads: 0 \/ 2/);
      assert.equal(actual.rows.filter((row) => row.cells[4] === "UNKNOWN — response unobserved").length, 4);
      assert.equal(actual.historyCount, "6 / 6 runs");
      assert.equal(actual.full, true);
      const history = actual.history;
      await page.evaluate(() => document.getElementById("controls").requestSubmit());
      actual = await read();
      assert.match(actual.error, /History is full/);
      assert.equal(actual.focus, "input-error");
      assert.deepEqual(actual.history, history);
      assert.equal(actual.historyCount, "6 / 6 runs");
      return actual;
    });

    await step("keyboard reset clears evidence and errors, restores defaults and focuses the first route", async () => {
      const actual = await reset();
      assert.equal(actual.historyCount, "0 / 6 runs");
      assert.equal(actual.visible, false);
      assert.equal(actual.summary, "");
      assert.equal(actual.rows.length, 0);
      assert.equal(actual.error, null);
      assert.equal(actual.focus, "route-alba");
      assert.equal(actual.full, false);
      assert.equal(actual.status, "Reset complete — no evidence yet.");
      assert.equal(await page.locator("#route-alba").inputValue(), "v2");
      assert.equal(await page.locator("#route-birch").inputValue(), "v2");
      assert.equal(await page.locator("#policy").inputValue(), "isolated");
      assert.equal(await page.locator("#controls input:checked").count(), 3);
      return actual;
    });

    await step("empty assertion selection and tampered enum are visible errors without adding or changing history", async () => {
      for (const id of ["own-read", "reject-foreign", "data-tenant"]) await toggle(id);
      const rejected = await conduct();
      assert.match(rejected.error, /Select at least one assertion/);
      assert.equal(rejected.focus, "input-error");
      assert.equal(rejected.historyCount, "0 / 6 runs");
      for (const id of ["own-read", "reject-foreign", "data-tenant"]) await toggle(id);
      const valid = await conduct();
      assert.equal(valid.error, null);
      const history = valid.history;
      await page.evaluate(() => {
        const select = document.getElementById("policy");
        select.value = "not-a-policy";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const tampered = await conduct();
      assert.match(tampered.error, /known v2 after-change policy/);
      assert.equal(tampered.focus, "input-error");
      assert.equal(tampered.visible, false);
      assert.deepEqual(tampered.history, history);
      await reset();
      return { emptySelection: rejected, tamperedEnum: tampered, resetFocus: (await read()).focus };
    });

    await step("split routing still exposes cross-tenant access on unselected reachable v2", async () => {
      await choose("route-alba", 0);
      await choose("route-birch", 1);
      await choose("policy", 1);
      const actual = await conduct();
      assert.match(actual.summary, /Alba v1, Birch v2/);
      assert.match(actual.summary, /success 14 \/ failure 2 \/ unknown 0/);
      assert.match(actual.summary, /Observed authorized v2 route reads: 1 \/ 2 \(birch\)/);
      const failures = actual.rows.filter((row) => row.outcome === "failure");
      assert.equal(failures.find((row) => row.cells[2].startsWith("synthetic-alba-member")).cells[1], "v2 / direct");
      assert.equal(failures.find((row) => row.cells[2].startsWith("synthetic-birch-member")).cells[1], "v2 / routed");
      return actual;
    });

    await step("a corrected run cannot overwrite the previous failure or its retained trace", async () => {
      const first = await page.locator("#history > li").first().textContent();
      await choose("policy", 0);
      const actual = await conduct();
      assert.match(actual.summary, /SUCCESS; verifier PASS/);
      assert.equal(actual.historyCount, "2 / 6 runs");
      assert.match(actual.history[0], /FAILURE/);
      assert.match(actual.history[1], /SUCCESS/);
      assert.equal(await page.locator("#history > li").first().textContent(), first);
      return actual;
    });

    await step("narrow viewport contains page width and a focused trace scrolls with the keyboard", async () => {
      await page.setViewportSize({ width: 360, height: 800 });
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth,
        traceViewport: document.getElementById("current-trace").clientWidth,
        traceContent: document.getElementById("current-trace").scrollWidth,
        focusOutline: getComputedStyle(document.getElementById("conduct")).outlineStyle
      }));
      assert.ok(layout.page <= layout.viewport + 1);
      assert.ok(layout.traceContent > layout.traceViewport);
      await page.locator("#current-trace").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.getElementById("current-trace").scrollLeft > 0);
      assert.equal((await read()).focus, "current-trace");
      return { ...layout, scrollLeft: await page.locator("#current-trace").evaluate((node) => node.scrollLeft) };
    });

    await step("real CSP blocks inline code/styles, connections, images, frames, workers, forms and base changes", async () => {
      const originalURL = page.url();
      await page.evaluate(() => {
        window.__s038Violations = [];
        window.__s038InlineExecuted = false;
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__s038Violations.push({
            directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition
          });
        });
        const script = document.createElement("script");
        script.textContent = "window.__s038InlineExecuted = true";
        document.body.append(script);
        const style = document.createElement("style");
        style.textContent = "body { --s038-unsafe-style: applied; }";
        document.head.append(style);
        fetch("https://s038.invalid/forbidden").catch(() => {});
        const image = document.createElement("img");
        image.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
        document.body.append(image);
        const frame = document.createElement("iframe");
        frame.src = "https://s038.invalid/frame";
        document.body.append(frame);
        const blob = URL.createObjectURL(new Blob(["postMessage('blocked')"], { type: "text/javascript" }));
        try {
          const worker = new Worker(blob);
          worker.onerror = (event) => { event.preventDefault(); worker.terminate(); URL.revokeObjectURL(blob); };
          worker.onmessage = () => { window.__s038WorkerExecuted = true; worker.terminate(); URL.revokeObjectURL(blob); };
        } catch { URL.revokeObjectURL(blob); }
        const form = document.createElement("form");
        form.action = "https://s038.invalid/form";
        document.body.append(form);
        HTMLFormElement.prototype.submit.call(form);
        const base = document.createElement("base");
        base.href = "https://s038.invalid/";
        document.head.append(base);
      });
      await page.waitForFunction(() => {
        const names = window.__s038Violations.map((item) => item.directive);
        return ["script-src-elem", "style-src-elem", "connect-src", "img-src", "frame-src", "worker-src", "form-action", "base-uri"].every((name) => names.includes(name));
      });
      const actual = await page.evaluate(() => ({
        inlineExecuted: window.__s038InlineExecuted,
        workerExecuted: window.__s038WorkerExecuted === true,
        unsafeStyle: getComputedStyle(document.body).getPropertyValue("--s038-unsafe-style"),
        violations: window.__s038Violations
      }));
      assert.equal(actual.inlineExecuted, false);
      assert.equal(actual.workerExecuted, false);
      assert.equal(actual.unsafeStyle, "");
      assert.ok(actual.violations.every((item) => item.disposition === "enforce"));
      assert.equal(page.url(), originalURL);
      assert.deepEqual(networkAttempts, [], "CSP must block network before the additional test route guard.");
      assert.deepEqual(pageErrors, []);
      return actual;
    });
  } catch (error) {
    lifecycleError = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        awaitedFinallyClose = true;
      }
    } catch (error) {
      cleanupError = error.message;
      throw error;
    } finally {
      const record = {
        cardId: "A-S038", owner: "worker-A-S038", mode: "synthetic-file-lesson",
        startedAtUtc, completedAtUtc: new Date().toISOString(),
        node: process.version, playwrightVersion, browserVersion,
        helperCommit: "53c0c0d82cc1db6780a87ac2b1085734af6d5c60",
        helperSha256: digest(fs.readFileSync(helper)),
        sourceHashes: hashes(), observations, pageErrors, networkAttempts,
        lifecycleError, cleanupError, awaitedFinallyClose,
        verifier: observations.length === 13 && observations.every((item) => item.passed)
          && awaitedFinallyClose && !lifecycleError && !cleanupError ? "PASS" : "FAIL",
        limits: "Local Node22 / offline Playwright1.56.1 / signed Edge156 only. No native Azure, production24 or source-parent certification."
      };
      if (process.env.CAPTURE_BROWSER_EVIDENCE === "1") {
        const directory = path.join(root, "evidence");
        let sequence = 1;
        while (fs.existsSync(path.join(directory, `browser-${String(sequence).padStart(3, "0")}.json`))) sequence++;
        fs.writeFileSync(path.join(directory, `browser-${String(sequence).padStart(3, "0")}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
      }
      console.log(`S038 browser observations: ${observations.filter((item) => item.passed).length}/${observations.length}; awaited finally close: ${awaitedFinallyClose}; ${record.verifier}.`);
    }
  }
});
