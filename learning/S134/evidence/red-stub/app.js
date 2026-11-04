'use strict';
const form = document.getElementById('checkout-form');
let state = CheckoutLesson.createState();
form.addEventListener('submit', (event) => {
  event.preventDefault();
  state = CheckoutLesson.execute(state, {
    type: 'load',
    checkoutId: document.getElementById('checkout-id').value,
  });
  document.getElementById('phase').textContent = state.phase;
  document.getElementById('status').textContent = 'Stub loaded; no checkout behavior implemented.';
});
