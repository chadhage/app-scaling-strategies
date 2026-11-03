"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../lesson.js");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function mountApp() {
  const elements = {};
  const document = {
    activeElement: null,
    getElementById: (id) => elements[id],
    createElement: () => new Element(),
    createTextNode: (text) => ({ textContent: text })
  };
  class Element {
    constructor() {
      this.value = "";
      this.checked = false;
      this.disabled = false;
      this.textContent = "";
      this.dataset = {};
      this.children = [];
      this.handlers = {};
    }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    emit(type) {
      let prevented = false;
      this.handlers[type]({ preventDefault() { prevented = true; } });
      return prevented;
    }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    focus() { document.activeElement = this; }
  }
  class NativeForm extends Element {
    reset() {
      for (const [key, value] of Object.entries(model.DEFAULTS)) elements[key].value = value;
    }
  }
  for (const id of [
    ...Object.keys(model.DEFAULTS), "acknowledgments", "verification-checks",
    "verifier-result", "run-outcome", "effective-settings", "routing-result",
    "trace", "impact-result", "worker-result", "cleanup-result", "status",
    "verify", "reset", "ack-target", "ack-gates", "ack-recycle", "ack-impact", "ack-scope"
  ]) elements[id] = new Element();
  elements.exercise = new NativeForm();
  const boxes = ["ack-target", "ack-gates", "ack-recycle", "ack-impact", "ack-scope"]
    .map((id) => elements[id]);
  elements.acknowledgments.querySelectorAll = () => boxes;
  NativeForm.prototype.reset.call(elements.exercise);
  // A named reset control masks the native form method in the real browser.
  elements.exercise.reset = elements.reset;
  elements.acknowledgments.disabled = true;
  elements.verify.disabled = true;
  vm.runInNewContext(source, { S002: model, document, HTMLFormElement: NativeForm });
  return { elements, boxes, document };
}

test("runtime reset clears safe, blocked, invalid and interrupted results despite the reset control", () => {
  for (const change of [{}, { target: "staging" }, { profile: "" }, { formerWork: "interrupted" }]) {
    const { elements, boxes, document } = mountApp();
    for (const [key, value] of Object.entries(change)) elements[key].value = value;
    assert.equal(elements.exercise.emit("submit"), true);
    boxes.forEach((box) => { box.checked = true; });
    elements.verify.emit("click");
    assert.equal(elements["verifier-result"].dataset.verdict, "pass");
    assert.notEqual(typeof elements.exercise.reset, "function");
    assert.doesNotThrow(() => elements.reset.emit("click"));
    for (const [key, value] of Object.entries(model.DEFAULTS)) assert.equal(elements[key].value, value);
    assert.equal(elements["run-outcome"].dataset.state, "not-run");
    assert.equal(elements["impact-result"].dataset.impact, "not-run");
    assert.equal(elements["verifier-result"].dataset.verdict, "not-checked");
    assert.equal(elements.verify.disabled, true);
    assert.equal(elements.acknowledgments.disabled, true);
    assert.ok(boxes.every((box) => !box.checked));
    assert.equal(elements["verification-checks"].children.length, 0);
    assert.equal(elements.trace.children.length, 1);
    assert.match(elements.trace.children[0].textContent, /Run the exercise/);
    assert.equal(elements["effective-settings"].textContent, "Not evaluated.");
    assert.match(elements["routing-result"].textContent, /Production v1. No candidate exposed/);
    assert.match(elements["cleanup-result"].textContent, /CLEANED.*Zero cloud resources/);
    assert.equal(document.activeElement, elements.profile);
  }
});

test("runtime condition changes invalidate the old checklist and verdict until another run", () => {
  const { elements, boxes } = mountApp();
  elements.exercise.emit("submit");
  boxes.forEach((box) => { box.checked = true; });
  elements.verify.emit("click");
  assert.equal(elements["verifier-result"].dataset.verdict, "pass");
  elements.target.value = "staging";
  elements.exercise.emit("change");
  assert.equal(elements["run-outcome"].dataset.state, "stale");
  assert.equal(elements.verify.disabled, true);
  assert.equal(elements.acknowledgments.disabled, true);
  assert.ok(boxes.every((box) => !box.checked));
  assert.equal(elements["verification-checks"].children.length, 0);
  elements.verify.emit("click");
  assert.equal(elements["verifier-result"].dataset.verdict, "not-checked");
  elements.exercise.emit("submit");
  assert.equal(elements["run-outcome"].dataset.state, "blocked");
  assert.equal(elements.verify.disabled, false);
});

test("runtime invalid selection fails closed and cannot invent former-worker success", () => {
  const { elements, boxes, document } = mountApp();
  elements.profile.value = "";
  elements.exercise.emit("submit");
  assert.equal(elements["run-outcome"].dataset.state, "blocked");
  assert.match(elements.status.textContent, /Unrecognized selection/);
  assert.match(elements["routing-result"].textContent, /v1 → v1/);
  assert.match(elements["worker-result"].textContent, /recycling or completion is not claimed/);
  assert.equal(elements.trace.children.some((item) => item.dataset.phase === "routing-switch"), false);
  elements.verify.emit("click");
  assert.equal(elements["verifier-result"].dataset.verdict, "incomplete");
  assert.equal(document.activeElement, boxes[0]);
  boxes.forEach((box) => { box.checked = true; });
  elements.verify.emit("click");
  assert.match(elements["verifier-result"].textContent, /unsafe selection correctly blocked/);
  assert.equal(elements["impact-result"].dataset.impact, "not-run");
});
