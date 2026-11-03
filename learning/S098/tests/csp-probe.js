(async function () {
  'use strict';

  const proof = {
    done: false, evaluationBlocked: false, inlineBlocked: false,
    connectionBlocked: false, imageBlocked: false, formBlocked: false, violations: [],
  };
  globalThis.__s098CspProbe = proof;
  document.addEventListener('securitypolicyviolation', (event) => {
    proof.violations.push({
      directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
    });
  });
  try {
    eval('globalThis.__s098EvaluationExecuted = true');
  } catch (error) {
    proof.evaluationBlocked = error.name === 'EvalError';
  }
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.__s098InlineExecuted = true';
  document.head.appendChild(inline);
  const connection = fetch('https://s098-training.invalid/blocked-connection')
    .then(() => { proof.connectionBlocked = false; }, () => { proof.connectionBlocked = true; });
  const image = document.createElement('img');
  const imageCheck = new Promise((resolve) => {
    image.onload = () => { proof.imageBlocked = false; resolve(); };
    image.onerror = () => { proof.imageBlocked = true; resolve(); };
  });
  image.src = 'https://s098-training.invalid/blocked-image.png';
  document.body.appendChild(image);
  const form = document.createElement('form');
  form.action = 'https://s098-training.invalid/blocked-form';
  form.method = 'post';
  document.body.appendChild(form);
  form.submit();
  await Promise.all([connection, imageCheck]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  proof.evaluationBlocked = proof.evaluationBlocked && globalThis.__s098EvaluationExecuted !== true;
  proof.inlineBlocked = globalThis.__s098InlineExecuted !== true;
  proof.formBlocked = proof.violations.some((entry) => entry.directive === 'form-action');
  image.remove();
  form.remove();
  inline.remove();
  proof.done = true;
}());
