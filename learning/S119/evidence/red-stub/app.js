'use strict';

let exercise = S119.initialState();
document.getElementById('restore-button').addEventListener('click', () => {
  exercise = S119.transition(exercise, { type: 'restore', fixture: 'aligned' });
  document.getElementById('phase').textContent = exercise.phase;
});
