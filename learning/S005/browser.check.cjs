"use strict";

async function verifyS005Browser(page) {
  const checks = [];
  const errors = [];
  const externalRequests = [];
  const onError = error => errors.push(String(error));
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  const onRequest = request => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("request", onRequest);
  const text = id => page.locator(`#${id}`).innerText();
  const rows = async () => ({
    cedar: await page.locator('[data-tenant="cedar"]').innerText(),
    birch: await page.locator('[data-tenant="birch"]').innerText(),
    maple: await page.locator('[data-tenant="maple"]').innerText()
  });
  const check = (name, value) => {
    if (!value) throw new Error(name);
    checks.push({ name, passed: true });
  };
  let expectedSubmits = 0;
  let expectedResets = 0;
  const enter = async () => {
    await page.keyboard.press("Enter");
    expectedSubmits += 1;
  };
  const activate = async id => {
    await page.locator(`#${id}`).focus();
    await enter();
  };
  let initial;
  const reset = async label => {
    await page.locator("#reset-rehearsal").focus();
    await page.keyboard.press("Space");
    expectedResets += 1;
    check(`native keyboard Reset restores baseline (${label})`,
      await page.locator("#tenant-id").inputValue() === "cedar" &&
      await text("selected-tenant") === "cedar" &&
      await text("clock") === "0 / 80 synthetic steps" &&
      await text("last-observation") === "No request sampled" &&
      await text("source-effects") === "0 writes · 0 jobs" &&
      await text("target-effects") === "0 writes · 0 jobs" &&
      await text("trace-empty") === "No actions yet." &&
      await page.locator("#trace tr").count() === 0 &&
      JSON.stringify(await rows()) === JSON.stringify(initial));
  };

  try {
    await page.reload({ waitUntil: "load" });
    const visibility = await page.evaluate(() => document.visibilityState);
    if (visibility !== "visible") throw new Error("Browser foreground unavailable; hidden-tab results must not count");
    check("actual page is visible", visibility === "visible");
    await page.evaluate(() => {
      const form = document.getElementById("migration-controls");
      form.dataset.trustedSubmits = "0";
      form.dataset.trustedResets = "0";
      form.addEventListener("submit", event => {
        if (event.isTrusted) form.dataset.trustedSubmits = String(Number(form.dataset.trustedSubmits) + 1);
      });
      form.addEventListener("reset", event => {
        if (event.isTrusted) form.dataset.trustedResets = String(Number(form.dataset.trustedResets) + 1);
      });
    });
    check("exact visible training banner", await page.locator(".training-banner").innerText() ===
      "Training rehearsal - synthetic data - not a live Azure result");
    check("native form reset and submit methods are unshadowed", await page.evaluate(() => {
      const form = document.getElementById("migration-controls");
      return form.reset === HTMLFormElement.prototype.reset && form.submit === HTMLFormElement.prototype.submit;
    }));
    initial = await rows();
    await page.locator("#tenant-id").focus();
    await page.keyboard.press("Tab");
    check("Tab reaches Observe", await page.evaluate(() => document.activeElement.id) === "observe");
    await enter();
    check("keyboard Observe samples source at step 1",
      (await text("action-observed")).startsWith("source") && (await text("last-observation")).includes("step 1"));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    check("Tab reaches transfer", await page.evaluate(() => document.activeElement.id) === "migrate");
    await enter();
    check("unsynchronized transfer blocks", (await text("reason")).startsWith("not-synchronized") &&
      await text("configured-route") === "source");
    check("blocked target intent is not an observed request or effect",
      await text("intended-destination") === "target" && await text("action-observed") === "No request sampled" &&
      await text("effect-deltas") === "source W0/J0 · target W0/J0");
    check("blocked attempt preserves all tenant route/data/owner/effect rows",
      JSON.stringify(await rows()) === JSON.stringify(initial));
    await page.keyboard.press("Shift+Tab");
    check("Shift+Tab reaches synchronization", await page.evaluate(() => document.activeElement.id) === "synchronize");
    await enter();
    check("synchronization copies one record without business effects",
      (await text("reason")).startsWith("synchronized") && await text("copy-count") === "1 toy records" &&
      await text("target-effects") === "0 writes · 0 jobs");
    await page.keyboard.press("Tab");
    await enter();
    check("exclusive target handoff advances fence once",
      await text("configured-route") === "target" && await text("owners") === "target / 2");
    check("handoff does not invent an observation or relabel the old sample",
      await text("action-observed") === "No request sampled" &&
      (await text("last-observation")).startsWith("source · step 1"));
    await activate("observe");
    check("post-handoff request observes target at step 5",
      (await text("action-observed")).startsWith("target") && (await text("last-observation")).includes("step 5"));
    await activate("write");
    await activate("job");
    check("exactly one target write and job and no source effect",
      await text("target-effects") === "1 writes · 1 jobs" && await text("source-effects") === "0 writes · 0 jobs");
    const afterEffects = await rows();
    check("unrelated birch and maple rows stay intact",
      afterEffects.birch === initial.birch && afterEffects.maple === initial.maple);
    await activate("source-worker");
    check("captured source fence blocks stale work without state effects",
      (await text("reason")).startsWith("stale-fence") &&
      JSON.stringify(await rows()) === JSON.stringify(afterEffects));
    await activate("audit-unrelated");
    check("unrelated-route drift proposal is detected and not applied",
      (await text("reason")).startsWith("unrelated-tenant-change") &&
      (await text("proposal-result")).includes("birch") &&
      JSON.stringify(await rows()) === JSON.stringify(afterEffects));
    check("applied-state isolation stays PASS after rejecting drift",
      (await text("isolation")).startsWith("PASS") && await text("effect-deltas") === "source W0/J0 · target W0/J0");
    await reset("completed migration");

    await page.locator("#tenant-id").focus();
    await page.keyboard.press("End");
    check("native select keyboard chooses maple", await page.locator("#tenant-id").inputValue() === "maple");
    await activate("synchronize");
    await activate("migrate");
    const mapleMoved = await rows();
    check("a different selected tenant moves without touching cedar or birch",
      await text("configured-route") === "target" && await text("owners") === "target / 2" &&
      mapleMoved.cedar === initial.cedar && mapleMoved.birch === initial.birch);
    await reset("changed tenant selection");

    await activate("synchronize");
    await activate("dual-owner");
    check("dual-owner fixture is visibly unsafe, not a successful migration",
      (await text("ownership-invariant")).includes("UNSAFE on cedar") &&
      (await text("verdict")).startsWith("UNSAFE FIXTURE"));
    const dualRows = await rows();
    for (const id of ["migrate", "write", "job", "observe"]) {
      await activate(id);
      check(`dual ownership blocks ${id} with no new observation or effect`,
        (await text("reason")).startsWith("dual-ownership") &&
        await text("action-observed") === "No request sampled" &&
        await text("effect-deltas") === "source W0/J0 · target W0/J0" &&
        JSON.stringify(await rows()) === JSON.stringify(dualRows));
    }
    await reset("unsafe dual ownership");

    await activate("synchronize");
    await activate("write");
    await activate("migrate");
    check("source write makes an earlier synchronization stale",
      (await text("reason")).startsWith("not-synchronized") && await text("configured-route") === "source");
    await activate("synchronize");
    await activate("migrate");
    check("resynchronization retains the source write before transfer",
      (await text("reason")).startsWith("migrated") &&
      (await page.locator('[data-tenant="cedar"]').innerText()).includes("125 / 2 / 0"));
    await reset("stale-copy recovery");

    await page.evaluate(() => {
      const option = document.createElement("option");
      option.value = "__proto__";
      option.textContent = "Unsupported input test tenant";
      document.getElementById("tenant-id").append(option);
    });
    await page.locator("#tenant-id").focus();
    await page.keyboard.press("End");
    check("native select reaches tampered unknown tenant", await page.locator("#tenant-id").inputValue() === "__proto__");
    await activate("migrate");
    check("unknown tenant fails closed through actual form submission",
      (await text("reason")).startsWith("unknown-tenant") &&
      await text("effect-deltas") === "source W0/J0 · target W0/J0" &&
      JSON.stringify(await rows()) === JSON.stringify(initial));
    await reset("unknown tenant");
    await page.evaluate(() => { document.querySelector('#tenant-id option[value="__proto__"]').remove(); });
    await page.evaluate(() => { document.getElementById("migrate").value = "unrecognized-action"; });
    await activate("migrate");
    check("unknown action fails closed without inventing intent",
      (await text("reason")).startsWith("unknown-action") &&
      await text("intended-destination") === "Not applicable" &&
      JSON.stringify(await rows()) === JSON.stringify(initial));
    await page.evaluate(() => { document.getElementById("migrate").value = "migrate"; });
    await reset("unknown action");
    const trusted = await page.evaluate(() => {
      const form = document.getElementById("migration-controls");
      return { submits: Number(form.dataset.trustedSubmits), resets: Number(form.dataset.trustedResets) };
    });
    check("all commands were trusted keyboard form submissions", trusted.submits === expectedSubmits);
    check("all Resets were trusted native keyboard resets", trusted.resets === expectedResets);
    check("native form methods still callable after unsafe and unknown input", await page.evaluate(() => {
      const form = document.getElementById("migration-controls");
      return form.reset === HTMLFormElement.prototype.reset && form.submit === HTMLFormElement.prototype.submit;
    }));
    check("page stayed visible through final verification", await page.evaluate(() => document.visibilityState) === "visible");
    check("no browser page or console errors", errors.length === 0);
    check("no HTTP or HTTPS requests", externalRequests.length === 0);
    return {
      mode: "actual-browser-DOM-and-trusted-keyboard",
      passed: checks.length, failed: 0, checks, trusted,
      initialSnapshots: initial, finalSnapshots: await rows(),
      finalClock: await text("clock"), finalReason: await text("reason"),
      errors, externalRequests
    };
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("request", onRequest);
  }
}

module.exports = { verifyS005Browser };
