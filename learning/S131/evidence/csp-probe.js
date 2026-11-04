(function probeLocalBrowserCsp() {
  'use strict';
  const proof = { violations: [], inlineRan: false, evalRan: false, connection: 'pending' };
  globalThis.S131CspProof = proof;
  document.addEventListener('securitypolicyviolation', (event) => {
    proof.violations.push({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
  });
  const inline = document.createElement('script');
  inline.textContent = 'globalThis.S131CspProof.inlineRan = true;';
  document.head.append(inline);
  try {
    eval('globalThis.S131CspProof.evalRan = true;');
  } catch (error) {
    proof.evalError = error.name;
  }
  const ownedImage = new URL('../fixtures/v1.svg', document.currentScript.src);
  fetch(ownedImage).then(() => { proof.connection = 'unexpectedly-allowed'; })
    .catch((error) => { proof.connection = 'blocked'; proof.connectionError = error.name; });
}());
