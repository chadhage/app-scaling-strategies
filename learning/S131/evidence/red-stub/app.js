(function loadStub() {
  'use strict';
  document.getElementById('stub-load').addEventListener('click', () => {
    let state = S131Lesson.create();
    state = S131Lesson.command(state, {
      type: 'start', fixture: 'retained-assets', budgetMs: 2000, dataOnly: true,
    });
    state = S131Lesson.command(state, { type: 'capture-old' });
    document.getElementById('stub-result').textContent =
      `PASS (unsafe baseline): HTML ${S131Lesson.inspect(state).htmlStatus} only.`;
  });
}());
