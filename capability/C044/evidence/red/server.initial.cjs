'use strict';

// Retained loadable stub for the C044 RED: the naive first-cut live console that the specification rejects.
// It serves ordered events but ignores Last-Event-ID (every connection replays everything), stops the
// producer as soon as the last client leaves, accepts any cursor, validates nothing and persists nothing.
const http = require('node:http');

function frame(event) {
  return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function createRun({ context, scheduler, totalSteps = 50 }) {
  const events = [];
  const subscribers = new Set();
  const counters = { produced: 0, clientsAttached: 0 };
  let cancel = null;
  function produce() {
    if (events.length >= totalSteps) return null;
    const seq = events.length + 1;
    const event = {
      id: `${context.runId}:${context.epoch}:${seq}`, seq,
      event: seq === 1 ? 'run-started' : 'step-completed',
      data: { runId: context.runId, epoch: context.epoch, seq },
    };
    events.push(event);
    counters.produced += 1;
    for (const send of subscribers) send(event);
    return event;
  }
  return {
    context, counters, events, subscribers, produce,
    start() { if (!cancel) cancel = scheduler.every(1000, produce); },
    stopProducer() { if (cancel) { cancel(); cancel = null; } },
    snapshot() { return { runId: context.runId, epoch: context.epoch, headSeq: events.length, counters }; },
    close() { if (cancel) cancel(); cancel = null; },
  };
}

function createLocalServer({ run }) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(': connected\n\n');
    for (const event of run.events) response.write(frame(event));
    const send = (event) => response.write(frame(event));
    run.subscribers.add(send);
    run.counters.clientsAttached += 1;
    request.on('close', () => {
      run.subscribers.delete(send);
      run.counters.clientsAttached -= 1;
      if (run.counters.clientsAttached === 0) run.stopProducer();
    });
  });
  server.run = run;
  server.on('listening', () => run.start());
  server.on('close', () => run.close());
  return server;
}

module.exports = Object.freeze({ createRun, createLocalServer });
