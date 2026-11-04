'use strict';
(() => {
  let state = S129Lesson.createState();
  document.getElementById('swap-button').addEventListener('click', () => {
    state = S129Lesson.send(state, { type: 'swap' });
    const result = S129Lesson.assess(state);
    document.getElementById('phase').textContent = result.phase;
    document.getElementById('attempted').textContent = result.counts.attempted;
  });
})();
