(function () {
  'use strict';
  let state = globalThis.S126Lesson.createState();
  const form = document.getElementById('plan-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state = globalThis.S126Lesson.execute(state, {
      type: 'prepare', fixture: 'healthy', token: document.getElementById('token').value,
    });
    document.getElementById('phase').textContent = state.phase;
  });
}());
