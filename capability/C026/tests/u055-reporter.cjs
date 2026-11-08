'use strict';

module.exports = async function* reporter(events) {
  for await (const event of events) {
    const data = event.data;
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      yield `${event.type === 'test:pass' ? 'ok' : 'not ok'} ${data.testNumber} - ${data.name}\n`;
      if (event.type === 'test:fail') {
        const error = data.details.error.cause ?? data.details.error;
        yield `  ---\n  name: '${error.name}'\n  code: '${error.code ?? data.details.error.failureType}'\n  ...\n`;
      }
    } else if (event.type === 'test:diagnostic' && /^(tests|suites|pass|fail|cancelled|skipped|todo) \d+$/.test(data.message)) {
      yield `# ${data.message}\n`;
    }
  }
};
