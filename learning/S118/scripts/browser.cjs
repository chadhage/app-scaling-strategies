"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  repoRoot, sha256, sourceHashes, ownedFileHashes, captureBrowserReport,
} = require(".\\evidence.cjs");

const helperPath = path.join(repoRoot, "testing", "browser", "isolated.cjs");
const helperSha256 = sha256(fs.readFileSync(helperPath));
assert.equal(helperSha256, "86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055");
const { openIsolatedLesson } = require(helperPath);
const playwrightVersion = require(path.join(repoRoot, "testing", "browser", "node_modules", "playwright", "package.json")).version;
assert.equal(playwrightVersion, "1.56.1");

async function observe() {
  const before = ownedFileHashes();
  const startedAtUtc = new Date().toISOString();
  const observations = [];
  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];
  const session = await openIsolatedLesson("learning\\S118\\index.html");
  const page = session.page;
  const focus = () => page.evaluate(() => document.activeElement.id);
  const phase = () => page.locator("#phase").innerText();
  const history = () => page.locator("#history li").allTextContents();
  const outcome = () => page.locator("#outcome").getAttribute("data-outcome");
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method() }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function measuredObservation(kind, expected) {
    assert.equal(await phase(), "measured");
    assert.equal(await outcome(), expected);
    const text = await page.locator("#outcome").innerText();
    assert.ok(text.startsWith(`${expected[0].toUpperCase()}${expected.slice(1)} -`));
    const data = JSON.parse(await page.locator("#observations").innerText());
    assert.equal(data.mutation.operationId, "fictional-operation-118");
    assert.equal(data.retry.operationId, data.mutation.operationId);
    assert.equal(data.retry.operationKey, data.mutation.operationKey);
    const result = {
      kind, outcome: expected, text, phase: await phase(),
      measurements: await page.locator("#measurements").innerText(),
      fictionalObservationsFromDOM: data,
      historyRows: (await history()).length,
    };
    observations.push(result);
    return result;
  }

  async function drive(fixture, expected) {
    await page.locator("#fixture").selectOption(fixture);
    await page.locator("#budget").fill("5");
    await page.locator("#record-mutation").click();
    assert.equal(await phase(), "mutated");
    assert.equal(await page.locator("#fixture").isDisabled(), true);
    assert.equal(await page.locator("#measure").isDisabled(), true);
    assert.equal(await outcome(), "unknown");
    await page.locator("#failover").click();
    assert.equal(await phase(), "rerouted");
    await page.locator("#retry").click();
    assert.equal(await phase(), "retried");
    assert.equal(await outcome(), "unknown");
    await page.locator("#measure").click();
    assert.equal(await page.locator("#lesson-error").innerText(), "");
    return measuredObservation(fixture, expected);
  }

  try {
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.locator("#training-banner").innerText(),
      "Training rehearsal - synthetic data - not a live Azure result");
    assert.equal(await phase(), "idle");
    assert.equal(await page.locator("#fixture option").count(), 8);
    assert.equal(await page.locator("#failover").isDisabled(), true);
    assert.equal(await page.locator("#retry").isDisabled(), true);
    assert.equal(await page.locator("#measure").isDisabled(), true);
    assert.equal(await page.locator("#reset-lesson").isDisabled(), true);
    assert.ok(["light", "dark"].includes(await page.locator("html").getAttribute("data-theme")));
    assert.deepEqual(pageErrors, []);

    await page.locator("#fixture").focus();
    await page.keyboard.press("Tab");
    assert.equal(await focus(), "budget");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("0");
    await page.keyboard.press("Tab");
    assert.equal(await focus(), "record-mutation");
    await page.keyboard.press("Enter");
    assert.equal(await phase(), "idle");
    assert.equal(await focus(), "budget");
    assert.equal(await page.locator("#budget").getAttribute("aria-invalid"), "true");
    assert.match(await page.locator("#lesson-error").innerText(), /canonical whole number from 1 to 10/);
    assert.equal((await history()).length, 0);
    observations.push({
      kind: "input-error", input: "0", focus: await focus(),
      message: await page.locator("#lesson-error").innerText(), historyRows: 0,
    });

    await page.locator("#budget").fill("5");
    await page.locator("#fixture").evaluate((select) => {
      const option = document.createElement("option");
      option.value = "__proto__";
      option.textContent = "Deliberate invalid fixture test";
      select.append(option);
    });
    await page.locator("#fixture").selectOption("__proto__");
    await page.locator("#record-mutation").click();
    assert.equal(await phase(), "idle");
    assert.equal(await focus(), "fixture");
    assert.equal(await page.locator("#fixture").getAttribute("aria-invalid"), "true");
    assert.match(await page.locator("#lesson-error").innerText(), /eight fixed fictional/);
    observations.push({
      kind: "input-error", input: "__proto__", message: await page.locator("#lesson-error").innerText(),
      focus: await focus(), historyRows: (await history()).length,
    });
    await page.locator('#fixture option[value="__proto__"]').evaluate((option) => option.remove());
    await page.locator("#fixture").selectOption("preserved");

    await page.locator("#measure").evaluate((button) => { button.disabled = false; });
    await page.locator("#measure").click();
    assert.equal(await phase(), "idle");
    assert.equal((await history()).length, 0);
    assert.match(await page.locator("#lesson-error").innerText(), /requires phase retried; current phase is idle/);
    observations.push({
      kind: "phase-error", injection: "enabled an out-of-order button in this owned test DOM",
      message: await page.locator("#lesson-error").innerText(), phase: await phase(), historyRows: 0,
    });
    await page.locator("#measure").evaluate((button) => { button.disabled = true; });

    const focusSteps = [];
    await page.locator("#fixture").focus();
    await page.keyboard.press("Tab");
    focusSteps.push(await focus());
    await page.keyboard.press("Control+A");
    await page.keyboard.type("5");
    await page.keyboard.press("Tab");
    focusSteps.push(await focus());
    await page.keyboard.press("Enter");
    assert.equal(await phase(), "mutated");
    focusSteps.push(await focus());
    assert.equal(await focus(), "failover");
    await page.keyboard.press("Space");
    assert.equal(await phase(), "rerouted");
    focusSteps.push(await focus());
    assert.equal(await focus(), "retry");
    await page.keyboard.press("Enter");
    assert.equal(await phase(), "retried");
    focusSteps.push(await focus());
    assert.equal(await focus(), "measure");
    await page.keyboard.press("Space");
    focusSteps.push(await focus());
    assert.equal(await focus(), "reset-lesson");
    const positive = await measuredObservation("positive", "positive");
    assert.equal(positive.fictionalObservationsFromDOM.retry.effectCount, 1);
    assert.equal(positive.fictionalObservationsFromDOM.retry.origin, "origin-B");
    assert.equal(positive.fictionalObservationsFromDOM.retry.identity, positive.fictionalObservationsFromDOM.mutation.identity);
    assert.equal(positive.fictionalObservationsFromDOM.retry.session, positive.fictionalObservationsFromDOM.mutation.session);
    assert.equal(positive.fictionalObservationsFromDOM.retry.requiredState, positive.fictionalObservationsFromDOM.mutation.requiredState);
    assert.equal(positive.fictionalObservationsFromDOM.mutation.acknowledgement, "lost");
    assert.match(positive.measurements, /3000 ms \/ 5000 ms/);
    observations.push({ kind: "keyboard", keys: ["Tab", "Enter", "Space"], focusSteps, phase: await phase() });

    const retained = await history();
    await page.keyboard.press("Space");
    assert.equal(await phase(), "idle");
    assert.equal(await focus(), "fixture");
    assert.equal(await page.locator("#budget").inputValue(), "5");
    assert.equal(await page.locator("#fixture").inputValue(), "preserved");
    const afterReset = await history();
    assert.deepEqual(afterReset.slice(0, 4), retained);
    assert.equal(afterReset.length, 5);
    assert.equal(await page.evaluate(() => typeof document.getElementById("journey-form").reset), "function");
    assert.equal(await outcome(), "unknown");
    observations.push({ kind: "retained-history-reset", retainedBefore: retained, retainedAfter: afterReset, focus: await focus() });

    const duplicate = await drive("duplicate", "negative");
    assert.equal(duplicate.fictionalObservationsFromDOM.retry.effectCount, 2);
    assert.match(duplicate.measurements, /Exactly one committed effect[\s\S]*NEGATIVE/);
    await page.locator("#reset-lesson").click();
    const lostIdentity = await drive("identity-lost", "negative");
    assert.notEqual(lostIdentity.fictionalObservationsFromDOM.retry.identity, lostIdentity.fictionalObservationsFromDOM.mutation.identity);
    assert.match(lostIdentity.measurements, /Identity continuity[\s\S]*NEGATIVE/);
    await page.locator("#reset-lesson").click();
    const unknown = await drive("unconfirmed", "unknown");
    assert.equal(unknown.fictionalObservationsFromDOM.retry.effectCount, null);
    assert.equal(unknown.fictionalObservationsFromDOM.retry.recoveryMs, null);
    assert.match(unknown.measurements, /Exactly one committed effect[\s\S]*UNKNOWN/);
    await page.locator("#reset-lesson").click();
    const boundedHistory = await history();
    assert.equal(boundedHistory.length, 20);
    assert.deepEqual(boundedHistory.slice(0, 4), retained);
    assert.equal(await page.locator("#record-mutation").isDisabled(), true);
    await page.locator("#record-mutation").evaluate((button) => { button.disabled = false; });
    await page.locator("#record-mutation").click();
    assert.equal((await history()).length, 20);
    assert.match(await page.locator("#lesson-error").innerText(), /History is full|Four fictional/);
    observations.push({
      kind: "bounded-history", journeys: 4, rows: 20, oldestDataRetained: true,
      extraAttemptError: await page.locator("#lesson-error").innerText(),
    });

    await page.reload({ waitUntil: "load" });
    assert.equal((await history()).length, 0);
    for (const fixture of ["session-lost", "route-pending", "late", "unavailable"]) {
      const result = await drive(fixture, "negative");
      if (fixture === "session-lost") {
        assert.notEqual(result.fictionalObservationsFromDOM.retry.session, result.fictionalObservationsFromDOM.mutation.session);
        assert.notEqual(result.fictionalObservationsFromDOM.retry.requiredState, result.fictionalObservationsFromDOM.mutation.requiredState);
      }
      if (fixture === "route-pending") {
        assert.equal(result.fictionalObservationsFromDOM.failover.desiredOrigin, "origin-B");
        assert.equal(result.fictionalObservationsFromDOM.retry.origin, "origin-A");
      }
      if (fixture === "late") assert.match(result.measurements, /8000 ms \/ 5000 ms/);
      if (fixture === "unavailable") {
        assert.equal(result.fictionalObservationsFromDOM.failover.failure, "alternate-origin-unavailable");
        assert.equal(result.fictionalObservationsFromDOM.retry.origin, null);
        assert.equal(result.fictionalObservationsFromDOM.retry.recoveryMs, null);
      }
      await page.locator("#reset-lesson").click();
    }
    assert.deepEqual(pageErrors, []);

    await page.reload({ waitUntil: "load" });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.locator("#budget").focus();
    const viewport = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      focusOutline: getComputedStyle(document.activeElement).outlineWidth,
      theme: document.documentElement.dataset.theme,
    }));
    assert.ok(viewport.scrollWidth <= viewport.width, "No horizontal overflow at a 360px viewport.");
    assert.equal(viewport.focusOutline, "3px");
    observations.push({ kind: "narrow-viewport", ...viewport });

    await page.evaluate(() => {
      globalThis.__s118CspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        globalThis.__s118CspViolations.push({
          directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
        });
      });
      const script = document.createElement("script");
      script.textContent = "globalThis.__s118UnauthorizedInline = true";
      document.head.append(script);
      const probe = document.createElement("script");
      probe.src = "scripts/csp-probe.js";
      document.head.append(probe);
    });
    await page.waitForFunction(() => globalThis.__s118ProbeResult);
    const forbiddenScript = await page.evaluate(() => globalThis.__s118ProbeResult);
    assert.equal(forbiddenScript.inlineRan, false);
    assert.equal(forbiddenScript.evaluationRan, false);
    assert.equal(forbiddenScript.evaluationError, "EvalError");
    assert.equal(forbiddenScript.localFileConnection.denied, true);
    await page.waitForFunction(() => ["script-src-elem", "script-src", "connect-src"].every((directive) =>
      globalThis.__s118CspViolations.some((item) => item.directive === directive && item.disposition === "enforce")));
    observations.push({
      kind: "csp", ...forbiddenScript,
      violations: await page.evaluate(() => globalThis.__s118CspViolations),
      note: "Allowed local probe code, not privileged DevTools evaluation, observes denials before any connector operation; only an owned local file URL was attempted.",
    });

    const errorsBeforeInjection = pageErrors.length;
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "FailoverLesson", { value: undefined, writable: false, configurable: false });
    });
    await page.reload({ waitUntil: "load" });
    assert.equal(await phase(), "unavailable");
    assert.match(await page.locator("#lesson-error").innerText(), /Lesson engine unavailable.*no journey was recorded/);
    assert.match(await page.locator("#outcome").innerText(), /Unknown.*engine unavailable/);
    const disabled = await page.locator("button, input, select").evaluateAll((controls) => controls.every((control) => control.disabled));
    assert.equal(disabled, true);
    assert.equal(await focus(), "lesson-error");
    assert.equal((await history()).length, 0);
    assert.equal(pageErrors.length, errorsBeforeInjection + 1);
    observations.push({
      kind: "engine-failure", injection: "owned DevTools startup test makes the lesson export unavailable; not CSP proof or a native outage",
      phase: await phase(), message: await page.locator("#lesson-error").innerText(),
      focus: await focus(), allControlsDisabled: disabled, actualScriptError: pageErrors.at(-1),
    });
    assert.ok(requests.every((request) => new URL(request.url).protocol === "file:" && request.method === "GET"));
  } finally {
    await session.close();
  }

  assert.deepEqual(ownedFileHashes(), before, "Observation must not modify any lesson source or evidence.");
  const report = {
    schemaVersion: 1, cardId: "A-S118", workerId: "worker-A-S118", passed: true,
    startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
    browserVersion: session.browserVersion, playwrightVersion, helperSha256,
    helperPublication: "53c0c0d", helperAPI: "openIsolatedLesson; awaited close in finally",
    dataScope: "All journey/failover/route/identity/session/state/write/effect/ack/failure/timing observations are fixed fictional teaching DATA.",
    observations, requests, consoleErrors, pageErrors,
    lessonFilesUnchangedDuringObservation: true,
    nativeAzureValidated: false, sourceParentAccepted: false, iacValidated: false,
    productionNode24Validated: false,
    toolingLimit: "Only this local Node 22 / Playwright 1.56.1 / Edge 156 run is observed. Shared helper lifecycle prototype is inactive and unqualified.",
    assets: sourceHashes(),
  };
  const captured = captureBrowserReport(report);
  console.log(JSON.stringify({ ...report, captured, readOnly: captured === null }, null, 2));
  return report;
}

if (require.main === module) observe().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { observe };
