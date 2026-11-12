'use strict';
const inspector = require('node:inspector'), fs = require('node:fs');
if (process.env.C047_FAULT_LOG) {
  const file = process.env.C047_FAULT_LOG, session = new inspector.Session(), scripts = new Map();
  fs.writeFileSync(file, '', { flag: 'wx' });
  session.connect();
  session.on('Debugger.scriptParsed', ({ params }) => scripts.set(params.scriptId, params.url));
  session.on('Debugger.paused', ({ params }) => {
    try {
      const exception = params.data;
      if (['ReferenceError', 'TypeError', 'RangeError', 'SyntaxError'].includes(exception?.className)) {
        const frames = params.callFrames.map(frame => ({ functionName: frame.functionName, url: frame.url || scripts.get(frame.location.scriptId) || '',
          line: frame.location.lineNumber + 1, column: frame.location.columnNumber + 1 }));
        const subject = String(process.env.C047_SUBJECT || '').replaceAll('\\', '/').toLowerCase();
        if (frames.some(frame => frame.url.replaceAll('\\', '/').toLowerCase().includes(subject) ||
          /capability[\\/](C009|C020|C022)[\\/]/.test(frame.url))) {
          fs.appendFileSync(file, JSON.stringify({ className: exception.className, description: exception.description || '',
            firstLine: (exception.description || '').split('\n')[0], reason: params.reason, frames, observedWhileCaughtOrUncaught: true }) + '\n');
        }
      }
    } finally { session.post('Debugger.resume'); }
  });
  session.post('Debugger.enable');
  session.post('Debugger.setPauseOnExceptions', { state: 'all' });
  process.once('beforeExit', () => session.disconnect());
}
