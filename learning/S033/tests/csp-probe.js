(function () {
  'use strict';
  window.__s033PolicyProbe = (async function () {
    const inline = document.createElement('script');
    inline.textContent = 'window.__s033InlineExecuted = true;';
    document.head.append(inline);
    let evaluationBlocked = false;
    try {
      new Function('window.__s033EvalExecuted = true;')();
    } catch (error) {
      evaluationBlocked = error.name === 'EvalError';
    }
    let connectionRejected = false;
    try {
      await fetch('https://example.invalid/s033-csp-probe');
    } catch {
      connectionRejected = true;
    }
    const form = document.createElement('form');
    form.action = 'https://example.invalid/s033-csp-form';
    form.method = 'POST';
    document.body.append(form);
    form.submit();
    form.remove();
    inline.remove();
    window.__s033PolicyResult = {
      inlineExecuted: window.__s033InlineExecuted === true,
      evaluationExecuted: window.__s033EvalExecuted === true,
      evaluationBlocked,
      connectionRejected,
    };
  }());
}());
