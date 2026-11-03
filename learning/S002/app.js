(function () {
  "use strict";
  const { DEFAULTS, runLesson, verifyLesson } = globalThis.S002;
  const byId = (id) => document.getElementById(id);
  const form = byId("exercise");
  const acknowledgments = byId("acknowledgments");
  const boxes = Array.from(acknowledgments.querySelectorAll('input[type="checkbox"]'));
  let current = null;

  function clearVerification() {
    boxes.forEach((box) => { box.checked = false; });
    byId("verification-checks").replaceChildren();
    byId("verifier-result").textContent = "NOT CHECKED — inspect the trace and acknowledge the expected outcomes.";
    byId("verifier-result").dataset.verdict = "not-checked";
  }

  function render(result) {
    const blocked = result.state === "blocked";
    byId("run-outcome").dataset.state = result.state;
    byId("run-outcome").textContent = blocked
      ? "BLOCKED — candidate not exposed in this fixture."
      : "REHEARSED — synthetic routing only; no live Azure success.";
    byId("effective-settings").textContent = Object.keys(result.effectiveSettings).length
      ? `${Object.entries(result.effectiveSettings).map(([key, value]) => `${key}=${value}`).join("; ")}. /readyz; accepted status 200.`
      : "Not applied: selection rejected before target-effective preparation.";
    byId("routing-result").textContent = `Production ${result.routing.before} → ${result.routing.after}. ${blocked ? "No routing switch." : "Only after both source instances passed the modeled gates."}`;
    byId("trace").replaceChildren(...result.trace.map((event) => {
      const item = document.createElement("li");
      item.dataset.phase = event.phase;
      const label = document.createElement("strong");
      label.textContent = `${event.at} · ${event.phase} `;
      item.append(label, document.createTextNode(event.detail));
      return item;
    }));
    byId("impact-result").dataset.impact = result.userImpact.classification;
    byId("impact-result").textContent = blocked
      ? "NOT RUN — unsafe promotion prevented in the fixture; real user continuity is unassessed."
      : result.userImpact.classification === "unknown"
        ? "UNKNOWN — opaque former-worker request, connection, and job outcomes. Uninterrupted migration is UNVERIFIED."
        : "INTERRUPTED — modeled request, connection, and job failure. Educational detection is NOT uninterrupted migration.";
    byId("worker-result").textContent = blocked
      ? "No modeled swap occurred; former-worker recycling or completion is not claimed."
      : "Former production v1 remains in staging, but its workers are RECYCLED. This is the documented lifecycle modeled synthetically, not an actual worker observation or a custom drain.";
    byId("cleanup-result").textContent = "Zero cloud resources created. Current trace exists only in page memory; reset or close to discard it. No persistent state or cloud cleanup.";
    clearVerification();
    acknowledgments.disabled = false;
    byId("verify").disabled = false;
    byId("status").textContent = blocked
      ? `Blocked. ${result.reasons.map((reason) => reason.message).join(" ")} Inspect the trace and check the educational outcomes.`
      : `Synthetic rehearsal generated. Former active work is ${result.userImpact.classification}; native continuity remains unverified. Inspect the trace, then check expected outcomes.`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selection = {};
    for (const key of Object.keys(DEFAULTS)) selection[key] = byId(key).value;
    current = runLesson(selection);
    render(current);
  });

  form.addEventListener("change", () => {
    if (!current) return;
    current = null;
    clearVerification();
    acknowledgments.disabled = true;
    byId("verify").disabled = true;
    byId("run-outcome").dataset.state = "stale";
    byId("run-outcome").textContent = "STALE — conditions changed. Run again; the previous trace below is not evidence for the new selection.";
    byId("status").textContent = "Conditions changed. Run again before checking outcomes; the displayed trace and impact belong to the previous selection.";
  });

  byId("verify").addEventListener("click", () => {
    if (!current) return;
    const missing = boxes.find((box) => !box.checked);
    if (missing) {
      byId("verifier-result").textContent = "INCOMPLETE — acknowledge every expected assertion after inspecting the trace. No educational pass yet.";
      byId("verifier-result").dataset.verdict = "incomplete";
      byId("status").textContent = "Verification incomplete. Review and acknowledge each expected outcome.";
      missing.focus();
      return;
    }
    const verdict = verifyLesson(current);
    byId("verification-checks").replaceChildren(...verdict.checks.map((check) => {
      const item = document.createElement("li");
      item.textContent = `${check.ok ? "PASS" : "FAIL"} · ${check.id}: ${check.expected}`;
      return item;
    }));
    byId("verifier-result").dataset.verdict = verdict.passed ? "pass" : "fail";
    byId("verifier-result").textContent = verdict.passed
      ? `PASS — educational assertions only${current.state === "blocked" ? " (unsafe selection correctly blocked)" : ""}. User impact: ${current.userImpact.classification}. This is NOT uninterrupted migration or native proof.`
      : "FAIL — the structured trace does not meet the educational assertions. No success is established.";
    byId("status").textContent = verdict.passed
      ? `Educational check passed. User impact remains ${current.userImpact.classification}; no uninterrupted migration or reliability certification.`
      : "Educational check failed. Review the failed assertions.";
  });

  byId("reset").addEventListener("click", () => {
    HTMLFormElement.prototype.reset.call(form);
    current = null;
    clearVerification();
    acknowledgments.disabled = true;
    byId("verify").disabled = true;
    byId("verifier-result").textContent = "NOT CHECKED — run and inspect a trace first.";
    byId("run-outcome").textContent = "NOT RUN — no native operation is available.";
    byId("run-outcome").dataset.state = "not-run";
    byId("trace").replaceChildren();
    const placeholder = document.createElement("li");
    placeholder.textContent = "Run the exercise to generate a synthetic trace.";
    byId("trace").append(placeholder);
    byId("effective-settings").textContent = "Not evaluated.";
    byId("routing-result").textContent = "Production v1. No candidate exposed.";
    byId("impact-result").dataset.impact = "not-run";
    byId("impact-result").textContent = "NOT RUN — uninterrupted migration is not assessed.";
    byId("worker-result").textContent = "A retained slot never establishes that its workers or in-flight work survive.";
    byId("cleanup-result").textContent = "CLEANED — local selections, trace, acknowledgments, verifier, and impact reset. Zero cloud resources created; no cloud cleanup required.";
    byId("status").textContent = "Local exercise reset. No resources were created or deleted; no persistent state remains.";
    byId("profile").focus();
  });
})();
