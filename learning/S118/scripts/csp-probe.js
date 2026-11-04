"use strict";

(async () => {
  const result = {
    inlineRan: globalThis.__s118UnauthorizedInline === true,
    evaluationRan: false,
    evaluationError: null,
    localFileConnection: null,
  };
  try { globalThis.eval("globalThis.__s118UnauthorizedEval = true"); }
  catch (error) { result.evaluationError = error.name; }
  result.evaluationRan = globalThis.__s118UnauthorizedEval === true;
  try {
    await fetch("model.js");
    result.localFileConnection = { denied: false };
  } catch (error) {
    result.localFileConnection = { denied: true, error: error.name };
  }
  globalThis.__s118ProbeResult = result;
})();
