'use strict';

// A manual scheduler with the setTimeout/clearTimeout shape the server, service and driver accept. Time moves only when
// advance() is called, so deadlines and paced streams are reproduced exactly, without wall-clock sleeps.
class ManualTimers {
  #now = 0;
  #sequence = 0;
  #pending = [];
  #waiters = [];

  get now() {
    return this.#now;
  }

  get pending() {
    return this.#pending.length;
  }

  setTimeout(fn, ms) {
    const timer = { fn, at: this.#now + ms, sequence: this.#sequence++ };
    this.#pending.push(timer);
    for (const waiter of [...this.#waiters]) waiter();
    return timer;
  }

  clearTimeout(timer) {
    this.#pending = this.#pending.filter((candidate) => candidate !== timer);
  }

  // Moves the clock forward and runs every timer that falls due, earliest first (ties in creation order).
  advance(ms) {
    const target = this.#now + ms;
    for (;;) {
      const due = this.#pending.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at || a.sequence - b.sequence)[0];
      if (due === undefined) break;
      this.#now = due.at;
      this.clearTimeout(due);
      due.fn();
    }
    this.#now = target;
  }

  // Resolves as soon as at least `count` timers are pending (event driven: it is re-checked whenever one is set).
  whenPending(count) {
    return new Promise((resolve) => {
      const check = () => {
        if (this.#pending.length < count) return;
        this.#waiters = this.#waiters.filter((waiter) => waiter !== check);
        resolve();
      };
      this.#waiters.push(check);
      check();
    });
  }
}

module.exports = Object.freeze({ ManualTimers });
