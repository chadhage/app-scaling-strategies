"use strict";

(function () {
  const lab = globalThis.S031Session;
  const byId = (id) => document.getElementById(id);
  const modeControl = byId("session-mode");
  const requestForm = byId("request-controls");
  const clientControl = byId("synthetic-client");
  const targetControl = byId("request-target");
  const fixtureControl = byId("reply-fixture");
  const replyEditor = byId("supplied-reply");
  let state;
  let latest = null;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function display(value) {
    return value === undefined || value === null ? "(missing / null)" : JSON.stringify(value);
  }

  function showError(result) {
    const error = byId("input-error");
    error.textContent = `${result.error.code}: ${result.error.message}`;
    error.hidden = false;
  }

  function clearError() {
    byId("input-error").hidden = true;
    byId("input-error").textContent = "";
  }

  function command() {
    return {
      clientId: clientControl.value,
      destination: targetControl.value,
      replyKind: fixtureControl.value
    };
  }

  function fillSample() {
    const result = lab.makeMatchingReply(state, command());
    if (!result.ok) {
      showError(result);
      return;
    }
    replyEditor.value = JSON.stringify(result.reply, null, 2);
    byId("editor-note").textContent = "Declared matching sample filled. No read or store write occurred.";
  }

  function renderClients() {
    const rows = state.clients.map((client) => {
      const row = element("tr");
      row.dataset.client = client.id;
      const identity = element("th");
      identity.scope = "row";
      identity.append(element("strong", client.id), element("small", client.origin));
      const declared = element("td");
      const details = element("details");
      details.append(
        element("summary", `${client.expectedProfile.profileId} · schema 1 · revision ${client.expectedProfile.revision}`),
        element("pre", JSON.stringify(client.expectedProfile, null, 2))
      );
      declared.append(details);
      row.append(identity, declared, element("td", client.lastRequestedDestination),
        element("td", client.latest ? client.latest.outcome.toUpperCase() : "NOT TESTED"));
      return row;
    });
    byId("client-rows").replaceChildren(...rows);
    byId("store-snapshot").textContent = JSON.stringify(
      state.mode === "shared" ? { sharedByClient: state.stores.shared } :
        { localByInstance: state.stores.local }, null, 2);
  }

  function renderAssertions() {
    const verdict = byId("read-verdict");
    verdict.dataset.outcome = latest ? latest.outcome : "not-tested";
    verdict.textContent = latest ?
      `Read #${latest.attempt} — ${latest.outcome.toUpperCase()} — ${latest.clientId} → ` +
      `${latest.destination} (HTTP ${latest.httpStatus ?? "unknown"}).` :
      "Not tested — no read observation exists.";
    byId("report-source").textContent = latest ? `Source: ${latest.source}.` :
      "Seed profiles are declarations, not successful read observations.";
    byId("reply-binding").textContent = latest ?
      `Requested ${latest.clientId} at ${latest.expectedRoute.version}/${latest.expectedRoute.instance}; ` +
      `reply claims ${latest.observedClientId ?? "unknown"} at ` +
      `${latest.observedRoute.version ?? "unknown"}/${latest.observedRoute.instance ?? "unknown"}.` :
      "A destination choice is not yet a reply.";
    byId("expected-profile").textContent = JSON.stringify(
      latest ? latest.expectedProfile : state.clients[0].expectedProfile, null, 2);
    byId("observed-profile").textContent = latest ?
      JSON.stringify(latest.observedProfile, null, 2) : "No reply observed.";
    const rows = latest ? latest.assertions.map((item) => {
      const row = element("tr");
      row.dataset.assertion = item.code;
      const label = element("th", item.label);
      label.scope = "row";
      row.append(label, element("td", display(item.expected), "mono"),
        element("td", display(item.observed), "mono"), element("td", item.status.toUpperCase(), item.status));
      return row;
    }) : [(() => {
      const row = element("tr");
      const cell = element("td", "No assertions have run. Seed data is not a successful response.");
      cell.colSpan = 4;
      row.append(cell);
      return row;
    })()];
    byId("assertion-rows").replaceChildren(...rows);
  }

  function render() {
    byId("mode-explanation").textContent = state.mode === "shared" ?
      "Active: SHARED. Every destination reads one map keyed by client; each declared profile is seeded once." :
      "Active: LOCAL. Amber exists only at blue-a; cobalt only at blue-b. Other local lookups return HTTP 200 with an empty profile.";
    document.body.dataset.activeMode = state.mode;
    renderClients();
    renderAssertions();
    const summary = lab.summarize(state);
    const storedReads = state.attempts.filter((item) => item.source.endsWith("stored-profile fixture")).length;
    const suppliedSamples = state.attempts.filter((item) => item.source === "supplied reply — not a store read").length;
    const injectedReplies = summary.attempted - storedReads - suppliedSamples;
    const runVerdict = byId("run-verdict");
    runVerdict.dataset.outcome = summary.outcome;
    runVerdict.textContent = {
      "not-tested": "Not tested — zero attempted reads.",
      "all-observed-preserved": "All observed reads preserved declared state — synthetic sample only.",
      interrupted: "INTERRUPTION RETAINED — at least one read lost or mismatched declared state.",
      unknown: "UNKNOWN RETAINED — at least one read lacks sufficient continuity evidence."
    }[summary.outcome];
    if (summary.allPreserved && storedReads === 0) {
      runVerdict.textContent = "Supplied sample checks matched — no stored-profile read was observed.";
    }
    byId("run-counts").textContent = `Attempted: ${summary.attempted} · Preserved: ${summary.preserved} · ` +
      `Interrupted: ${summary.interrupted} · Unknown: ${summary.unknown}`;
    byId("source-counts").textContent = `Stored-profile reads: ${storedReads} · ` +
      `Injected replies: ${injectedReplies} · Supplied samples: ${suppliedSamples}`;
    byId("trace-events").replaceChildren(...state.trace.map((event) => {
      const row = element("li");
      row.dataset.event = event.event;
      row.append(element("strong", `${event.sequence}. ${event.event}`),
        element("span", event.clientId ? `${event.clientId} → ${event.destination}` : "New synthetic run"),
        element("p", event.details));
      return row;
    }));
  }

  function startMode(mode) {
    const result = lab.startRehearsal(mode);
    if (!result.ok) {
      showError(result);
      return false;
    }
    state = result.state;
    latest = null;
    modeControl.value = mode;
    requestForm.reset();
    clearError();
    fillSample();
    render();
    return true;
  }

  function accept(result, replaceEditor = false) {
    if (!result.ok) {
      showError(result);
      return false;
    }
    clearError();
    state = result.state;
    latest = result.report;
    if (replaceEditor) replyEditor.value = JSON.stringify(latest.reply, null, 2);
    byId("editor-note").textContent = replaceEditor ?
      "Editor shows the last synthetic fixture reply. It is not a live response." :
      "Supplied reply verified as a sample only. Neither store was changed.";
    render();
    return true;
  }

  if (!lab) {
    showError({ error: { code: "lesson.unavailable", message: "Local behavior script did not load. No verification ran." } });
    return;
  }

  modeControl.addEventListener("change", () => startMode(modeControl.value));
  requestForm.addEventListener("submit", (event) => {
    event.preventDefault();
    accept(lab.visit(state, command()), true);
  });
  byId("verify-supplied-reply").addEventListener("click", () => {
    accept(lab.inspectReply(state, { ...command(), payloadText: replyEditor.value }));
  });
  byId("fill-matching-sample").addEventListener("click", () => {
    clearError();
    fillSample();
  });
  byId("reset-exercise").addEventListener("click", () => {
    startMode("local");
    modeControl.focus();
  });
  for (const button of document.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      const local = button.dataset.example === "local-loss";
      startMode(local ? "local" : "shared");
      const reads = button.dataset.example === "shared-tour" ? [
        { clientId: "client-amber", destination: "v2/green-a", replyKind: "stored" },
        { clientId: "client-amber", destination: "v1/blue-b", replyKind: "stored" },
        { clientId: "client-amber", destination: "v2/green-b", replyKind: "stored" },
        { clientId: "client-cobalt", destination: "v2/green-b", replyKind: "stored" }
      ] : [{
        clientId: "client-amber", destination: "v2/green-a",
        replyKind: button.dataset.example === "reset-profile" ? "reset" : "stored"
      }];
      for (const read of reads) {
        clientControl.value = read.clientId;
        targetControl.value = read.destination;
        fixtureControl.value = read.replyKind;
        accept(lab.visit(state, read), true);
      }
    });
  }
  startMode("local");
})();
