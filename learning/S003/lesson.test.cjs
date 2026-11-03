"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const model = require("./canary.js");

function loadLesson(overrides = {}) {
  let document;
  class Element {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.listeners = new Map();
      this.value = "";
      this.disabled = false;
      this.hidden = false;
      this.text = "";
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ""; this.children = children; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    focus() { document.activeElement = this; }
  }
  const html = readFileSync(join(__dirname, "index.html"), "utf8");
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element()]));
  document = {
    activeElement: null,
    getElementById: id => elements.get(id) ?? null,
    createElement: () => new Element()
  };
  elements.get("stage-plan").value = "5,25,50,100";
  elements.get("window-seconds").value = "30";
  elements.get("fixture").value = "safe";
  runInNewContext(readFileSync(join(__dirname, "lesson.js"), "utf8"), {
    document, RangeError, globalThis: { S003Canary: { ...model, ...overrides } }
  }, { filename: "lesson.js" });
  return {
    element: id => elements.get(id),
    text: id => elements.get(id).textContent,
    act: (id, type = "click") => elements.get(id).listeners.get(type)({ preventDefault() {} }),
    document
  };
}

test("BDD: malformed observations remain inspectable and cannot expand the lesson", () => {
  for (const users of [null, {}, "not samples", [null]]) {
    const lesson = loadLesson({
      makeObservation: run => ({ ...model.makeObservation(run), users })
    });
    assert.doesNotThrow(() => lesson.act("observe"), "Invalid samples must not crash rendering");
    assert.equal(lesson.text("desired-percent"), "5%");
    assert.equal(lesson.text("actual-destinations"), "Not observed");
    assert.match(lesson.text("journey-impact"), /0 recorded uninterrupted, 0 failed, 1 unknown/);
    assert.equal(lesson.element("cohort-rows").children.length, 20);
    assert.doesNotThrow(() => lesson.act("promote"));
    assert.equal(lesson.text("desired-percent"), "5%");
    assert.match(lesson.text("verification-verdict"), /negative educational verification/);
    assert.equal(lesson.element("trace").children.at(-1).dataset.event, "promotion-blocked");
  }
});

test("BDD: rejected configuration preserves the current or cleared rehearsal and can recover", () => {
  const lesson = loadLesson();
  lesson.act("observe");
  const trace = lesson.text("trace");
  const destinations = lesson.text("actual-destinations");
  for (const [stages, window] of [["5,5,100", "30"], ["3,100", "30"], ["5,25,100", "0"]]) {
    lesson.element("stage-plan").value = stages;
    lesson.element("window-seconds").value = window;
    assert.doesNotThrow(() => lesson.act("configuration", "submit"), "Invalid configuration needs a visible rejection");
    assert.equal(lesson.text("trace"), trace);
    assert.equal(lesson.text("actual-destinations"), destinations);
    assert.equal(lesson.text("desired-percent"), "5%");
    assert.match(lesson.text("configuration-error"), /Configuration rejected/);
    assert.match(lesson.text("live-result"), /unchanged/);
    assert.equal(lesson.element("configuration-error").hidden, false);
  }
  lesson.act("clear");
  assert.doesNotThrow(() => lesson.act("configuration", "submit"));
  assert.equal(lesson.text("desired-percent"), "No active rehearsal");
  assert.equal(lesson.element("observe").disabled, true);
  assert.equal(lesson.element("trace").children.length, 0);
  assert.match(lesson.text("live-result"), /No active rehearsal was started/);
  lesson.element("stage-plan").value = "10,30,60,100";
  lesson.element("window-seconds").value = "60";
  lesson.act("configuration", "submit");
  assert.equal(lesson.text("desired-percent"), "10%");
  assert.equal(lesson.element("trace").children.length, 1);
  assert.equal(lesson.element("configuration-error").hidden, true);
  assert.equal(lesson.text("configuration-error"), "");
  assert.equal(lesson.element("observe").disabled, false);
});

test("BDD: explicit clear and restart remove only the old local rehearsal and restore keyboard focus", () => {
  for (const fixture of ["regressed", "unknown"]) {
    const lesson = loadLesson();
    lesson.element("fixture").value = fixture;
    lesson.act("observe");
    lesson.act("promote");
    lesson.act("clear");
    assert.equal(lesson.element("trace").children.length, 0);
    assert.equal(lesson.element("cohort-rows").children.length, 0);
    assert.match(lesson.text("journey-impact"), /empty sample is not 100% success/);
    for (const id of ["observe", "promote", "age", "rollback", "clear"]) {
      assert.equal(lesson.element(id).disabled, true);
    }
    assert.equal(lesson.document.activeElement, lesson.element("start"));
    lesson.act("configuration", "submit");
    assert.equal(lesson.text("desired-percent"), "5%");
    assert.match(lesson.text("journey-impact"), /1 attempted transitions: 0 recorded uninterrupted, 0 failed, 1 unknown/);
    assert.equal(lesson.element("trace").children.length, 1);
    assert.equal(lesson.element("trace").children[0].dataset.event, "started");
    assert.doesNotMatch(lesson.text("gate-reasons"), /retained-failure|retained-regression/);
  }
});
