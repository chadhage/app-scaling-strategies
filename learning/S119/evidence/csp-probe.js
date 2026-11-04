'use strict';

// This test-only self-hosted script runs outside DevTools' eval exemption.
(async function observeCsp() {
  const violations = [];
  const nodes = [];
  const listener = (event) => violations.push({
    directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
  });
  document.addEventListener('securitypolicyviolation', listener);
  try {
    const script = document.createElement('script');
    script.textContent = 'window.__s119InlineRan = true';
    document.head.append(script);
    nodes.push(script);
    let evalBlocked = false;
    try { new Function('window.__s119EvalRan = true')(); } catch { evalBlocked = true; }
    const style = document.createElement('style');
    style.textContent = 'body { display: none !important; }';
    document.head.append(style);
    nodes.push(style);
    let connectionBlocked = false;
    try { await fetch('data:text/plain,fixed-fictional-CSP-probe'); } catch { connectionBlocked = true; }
    const image = document.createElement('img');
    const imageResult = new Promise((resolve) => {
      image.onload = () => resolve(false);
      image.onerror = () => resolve(true);
    });
    image.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xoAAAAASUVORK5CYII=';
    document.body.append(image);
    nodes.push(image);
    const form = document.createElement('form');
    form.action = window.location.href;
    form.method = 'get';
    document.body.append(form);
    nodes.push(form);
    HTMLFormElement.prototype.submit.call(form);
    const imageBlocked = await Promise.race([
      imageResult, new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    window.__s119CspResult = {
      inlineExecuted: window.__s119InlineRan === true,
      evalExecuted: window.__s119EvalRan === true,
      evalBlocked, connectionBlocked, imageBlocked,
      bodyVisible: getComputedStyle(document.body).display !== 'none',
      execution: 'allowed external self script, not DevTools evaluation',
      violations,
    };
  } finally {
    nodes.forEach((node) => node.remove());
    document.removeEventListener('securitypolicyviolation', listener);
  }
}()).catch((failure) => { window.__s119CspResult = { probeFailure: failure.message }; });
