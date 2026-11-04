'use strict';
const form = document.getElementById('lesson-controls');
const model = globalThis.S128Lesson;
let state = model.createState();
form.addEventListener('submit', (event) => {
  event.preventDefault();
  state = model.transition(state, {
    action: event.submitter.value,
    gaSelector: document.getElementById('ga-selector').value,
    previewSelector: document.getElementById('preview-selector').value,
    routing: document.getElementById('routing').value,
    fixture: document.getElementById('fixture').value,
  });
  document.getElementById('state-view').textContent = JSON.stringify(state, null, 2);
  document.getElementById('result').textContent = model.summarize(state).status;
});
document.getElementById('state-view').textContent = JSON.stringify(state, null, 2);
