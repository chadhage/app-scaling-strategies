'use strict';
function errorOf(error) {
  if (!error) return null;
  return { name: error.name, code: error.code, failureType: error.failureType, message: error.message, stack: error.stack, cause: errorOf(error.cause) };
}
module.exports = async function* (source) {
  for await (const event of source) {
    if (!['test:fail', 'test:pass', 'test:summary', 'test:diagnostic'].includes(event.type)) continue;
    const { name, testNumber, nesting, message, details, success, counts } = event.data;
    yield JSON.stringify({ type: event.type, name, testNumber, nesting, message, success, counts,
      details: details ? { type: details.type, passed: details.passed, duration_ms: details.duration_ms, error: errorOf(details.error) } : null }) + '\n';
  }
};
