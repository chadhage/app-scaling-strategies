'use strict';

// page.js under the DOM stub (real index.html ids, real script order in a vm context): keyboard, buttons, jumps, fragments, refusals.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('.\\dom-stub.cjs');
const { assertShown } = require('.\\invariants.cjs');
const T = require('..\\timeline.js');
const saved = require('..\\saved.js');

const consoleIds = saved.runs.filter((run) => run.kind === 'console').map((run) => run.id);
const hostileTraces = ['c034-reordered', 'c034-truncated', 'c034-tampered', 'c034-unknown-code'];
const choose = (page, id) => { page.$('saved-run').value = id; page.click('load'); };

test('before anything is chosen nothing is loaded, nothing is assumed to have succeeded and every control is off', () => {
  const page = loadPage();
  assert.match(require('.\\dom-stub.cjs').html, /<p id="status"[^>]*data-state="UNLOADED">No saved run is loaded\. Nothing is assumed to have succeeded\.<\/p>/);
  assert.equal(page.text('status'), 'No saved run is loaded. Nothing is assumed to have succeeded.');
  assert.equal(page.text('position'), 'Position: none');
  assert.equal(page.$('status').dataset.state, 'UNLOADED');
  assert.equal(page.$('saved-run').children.length, 10);
  assert.deepEqual(page.$('saved-run').children.map((option) => option.value), saved.runs.map((run) => run.id));
  assert.deepEqual(['aria-disabled', 'tabindex', 'aria-valuenow'].map((name) => page.$('scrub').getAttribute(name)), ['true', '-1', '0']);
  for (const id of ['prev', 'next', ...T.JUMPS.flatMap((kind) => [`prev-${kind}`, `next-${kind}`])]) assert.equal(page.$(id).disabled, true, id);
  assert.equal(page.$('entries').children.length, 0);
  page.key('ArrowRight');
  page.click('load');
  assert.match(page.text('error'), /^CHOOSE_A_RUN/);
  assert.equal(page.location.hash, '');
  assert.deepEqual(page.calls, []);
});

test('choosing and loading every valid saved run shows position 1 and satisfies the page invariants', () => {
  for (const id of ['c044-restart-gap', 'c044-complete', 'c044-truncated', 'c044-hostile-mix', 'c034-closed-history', 'c034-held-snapshot']) {
    const page = loadPage();
    choose(page, id);
    assertShown(page, id, 0, id);
    assert.equal(page.$('scrub').dispatch('keydown', { key: 'Home' }).defaultPrevented, true);
    assert.match(page.text('provenance'), new RegExp(`Source: C0(44|34) kanban/C0(44|34)/[0-9a-f]{12}( \\(FICTIONAL HOSTILE SET\\))?\\.$`));
    assert.ok(page.$('limits').children.length >= 1);
  }
});

test('a refused saved run shows its typed code, no timeline and no stale state from the run before it', () => {
  const page = loadPage({ hash: '#run=c044-complete&pos=5' });
  assertShown(page, 'c044-complete', 4);
  const codes = { 'c034-reordered': 'BOUNDARY_ACTION_ORDER', 'c034-truncated': 'MISSING_OR_DUPLICATE_ORIGINAL', 'c034-tampered': 'ORIGINAL_ELAPSED_MISMATCH', 'c034-unknown-code': 'UNKNOWN_ACTION' };
  for (const id of hostileTraces) {
    choose(page, id);
    assert.match(page.text('error'), new RegExp(`^REFUSED DECODER_REFUSED \\(${codes[id]}\\): this saved run is not shown as a timeline\\.$`));
    assert.match(page.text('status'), /This saved run was refused\. No timeline is shown/);
    assert.equal(page.$('entries').children.length, 0);
    assert.equal(page.$('state').children.length, 0);
    assert.equal(page.$('scrub').getAttribute('aria-disabled'), 'true');
    assert.equal(page.$('prev').disabled && page.$('next').disabled, true);
    assert.equal(page.text('position'), 'Position: none');
    assert.equal(page.$('status').dataset.state, 'UNLOADED');
    page.key('ArrowRight');
    assert.equal(page.text('position'), 'Position: none');
  }
  choose(page, 'c044-complete');
  assertShown(page, 'c044-complete', 0, 'recovered after a refusal');
});

test('Left, Right, Up, Down, PageUp, PageDown, Home and End move exactly as promised and other keys do nothing', () => {
  const page = loadPage({ hash: '#run=c044-restart-gap&pos=20' });
  const expectations = [['ArrowRight', 20], ['ArrowLeft', 19], ['ArrowUp', 20], ['ArrowDown', 19], ['PageUp', 29], ['PageDown', 19], ['End', 43], ['Home', 0]];
  for (const [key, index] of expectations) {
    assert.equal(page.key(key).defaultPrevented, true, key);
    assertShown(page, 'c044-restart-gap', index, key);
  }
  for (const key of ['a', 'Enter', 'Tab', ' ', 'Escape', '__proto__', 'constructor', 'toString', undefined]) assert.equal(page.key(key).defaultPrevented, false, String(key));
  assertShown(page, 'c044-restart-gap', 0, 'unchanged by other keys');
});

test('browser and assistive-technology shortcuts are never taken over: only plain and Shift keys move the slider', () => {
  const page = loadPage({ hash: '#run=c044-complete&pos=5' });
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
    for (const key of ['ArrowLeft', 'ArrowRight', 'PageUp', 'Home', 'End']) {
      const event = page.$('scrub').dispatch('keydown', { key, [modifier]: true });
      assert.equal(event.defaultPrevented, false, `${modifier}+${key} is left to the browser`);
      assert.equal(page.position(), 5);
    }
  }
  assert.equal(page.$('scrub').dispatch('keydown', { key: 'ArrowRight', shiftKey: true }).defaultPrevented, true);
  assertShown(page, 'c044-complete', 5, 'Shift+Right moves like Right');
});

test('a move that would leave the recording is a typed NOT_RECORDED refusal and the position does not change', () => {
  const page = loadPage({ hash: '#run=c044-complete&pos=1' });
  page.key('ArrowLeft');
  assert.match(page.text('error'), /^NOT_RECORDED: the requested position 0 is outside this recording \(positions 1 to 24\)\./);
  assert.equal(page.position(), 1);
  page.key('PageDown');
  assert.match(page.text('error'), /requested position -9 /);
  page.key('End');
  assertShown(page, 'c044-complete', 23);
  page.key('ArrowRight');
  assert.match(page.text('error'), /requested position 25 /);
  page.key('PageUp');
  assert.equal(page.position(), 24);
  assert.equal(page.$('scrub').getAttribute('aria-valuenow'), '24');
  assert.match(page.text('status'), /^Position 24 of 24: run completed \(step 20 of 20\); 0 failed events so far$/);
  page.key('ArrowLeft');
  assertShown(page, 'c044-complete', 22, 'a valid move clears the refusal');
});

test('Previous and Next step one position and are disabled at the ends; jump buttons land exactly on the next or previous hit', () => {
  const page = loadPage({ hash: '#run=c044-restart-gap&pos=1' });
  assert.deepEqual([page.$('prev').disabled, page.$('next').disabled], [true, false]);
  page.click('next');
  assertShown(page, 'c044-restart-gap', 1);
  page.click('prev');
  assertShown(page, 'c044-restart-gap', 0);
  const timeline = T.build(saved.runs[0]);
  for (const kind of T.JUMPS) {
    for (const index of [0, 10, 30, 43]) {
      page.key('Home');
      page.changeHash(`#run=c044-restart-gap&pos=${index + 1}`);
      for (const [name, direction] of [['next', 1], ['prev', -1]]) {
        const target = T.jump(timeline, index, kind, direction);
        assert.equal(page.$(`${name}-${kind}`).disabled, target === null, `${name}-${kind} from ${index}`);
        page.click(`${name}-${kind}`);
        if (target === null) assert.match(page.text('status'), new RegExp(`^No ${direction < 0 ? 'earlier' : 'later'} ${kind} in this recording\\.$`));
        else assertShown(page, 'c044-restart-gap', target, `${name}-${kind} from ${index}`);
        page.changeHash(`#run=c044-restart-gap&pos=${index + 1}`);
      }
    }
  }
  page.key('End');
  assert.equal(page.$('next').disabled, true);
});
test('every move rewrites the fragment, a valid fragment loads that run there and the browser back/forward (hashchange) is honoured', () => {
  const page = loadPage({ hash: '#run=c044-hostile-mix&pos=7' });
  assertShown(page, 'c044-hostile-mix', 6);
  page.key('ArrowRight');
  page.key('PageUp');
  page.click('next-unknown');
  assert.deepEqual(page.history.calls.slice(0, 2), ['#run=c044-hostile-mix&pos=7', '#run=c044-hostile-mix&pos=8']);
  page.changeHash('#pos=20&run=c034-closed-history');
  assertShown(page, 'c034-closed-history', 19, 'switched run by fragment');
  page.changeHash('#run=c034-closed-history&pos=43');
  assertShown(page, 'c034-closed-history', 42, 'moved by fragment');
  page.changeHash('#run=c044-complete&pos=1');
  assertShown(page, 'c044-complete', 0);
  page.changeHash('');
  assertShown(page, 'c044-complete', 0, 'an empty fragment changes nothing');
  assert.equal(page.history.calls.at(-1), '#run=c044-complete&pos=1');
});

test('a hostile fragment is a typed refusal that echoes nothing, never throws and leaves the displayed run and position unchanged', () => {
  const page = loadPage({ hash: '#run=c044-complete&pos=9' });
  const hostile = ['#run=c044-complete', '#run=c044-complete&pos=0', '#run=c044-complete&pos=-3', '#run=c044-complete&pos=NaN', '#run=c044-complete&pos=1e3',
    '#run=c044-complete&pos=0x10', '#run=c044-complete&pos=1&pos=2', '#run=c044-complete&run=c044-complete&pos=1', '#run=__proto__&pos=1', '#run=constructor&pos=1',
    '#run=<script>alert(1)</script>&pos=1', '#run=%3Cimg%20src=x%20onerror=alert(1)%3E&pos=1', '#run=c044-complete&pos=1&x=1', `#run=${'a'.repeat(5000)}&pos=1`,
    'run=c044-complete&pos=1', '#javascript:alert(1)', '#run=c044-complete&pos=\u0000', '#run=c044-complete&pos=1\n', '#run=C044-COMPLETE&pos=1', '#__proto__=1', '#&&&'];
  for (const text of hostile) {
    page.changeHash(text);
    assert.match(page.text('error'), /^(FRAGMENT_[A-Z_]+|RUN_UNKNOWN|POSITION_INVALID): the address fragment was refused and nothing from it is shown; the display is unchanged\.$/, text.slice(0, 30));
    assert.equal(page.position(), 9, text.slice(0, 30));
    assert.equal(page.$('saved-run').value, 'c044-complete');
    assert.doesNotMatch(page.text('error'), /script|alert|aaaa|onerror|__proto__/);
    assert.equal(page.history.calls.at(-1), '#run=c044-complete&pos=9');
  }
  assert.deepEqual(page.calls, []);
  assert.equal(page.$('entries').children.length, 24);
  page.changeHash('#run=c044-complete&pos=10');
  assertShown(page, 'c044-complete', 9, 'a valid fragment recovers and clears the refusal');
});

test('a position outside the recording named by a fragment is NOT_RECORDED, also for another run, and changes nothing', () => {
  const page = loadPage({ hash: '#run=c044-complete&pos=5' });
  for (const hash of ['#run=c044-complete&pos=25', '#run=c044-truncated&pos=18', '#run=c034-closed-history&pos=44', '#run=c034-held-snapshot&pos=999999']) {
    page.changeHash(hash);
    assert.match(page.text('error'), /^NOT_RECORDED: the requested position \d+ is outside this recording \(positions 1 to \d+\)\./, hash);
    assertShownUnchanged(page);
  }
  page.changeHash('#run=c044-truncated&pos=17');
  assertShown(page, 'c044-truncated', 16, 'the last recorded position is shown');
});

function assertShownUnchanged(page) {
  assert.equal(page.position(), 5);
  assert.equal(page.$('saved-run').value, 'c044-complete');
  assert.equal(page.location.hash, '#run=c044-complete&pos=5');
  assert.equal(page.$('entries').children.length, 24);
}

test('a refused run named by a fragment unloads the display and the next valid fragment recovers', () => {
  const page = loadPage({ hash: '#run=c034-reordered&pos=1' });
  assert.match(page.text('error'), /^REFUSED DECODER_REFUSED \(BOUNDARY_ACTION_ORDER\)/);
  assert.equal(page.position(), 0);
  assert.equal(page.$('saved-run').value, 'c034-reordered');
  page.changeHash('#run=c044-truncated&pos=3');
  assertShown(page, 'c044-truncated', 2);
  page.changeHash('#run=c034-truncated&pos=1');
  assert.match(page.text('error'), /MISSING_OR_DUPLICATE_ORIGINAL/);
  assert.equal(page.$('entries').children.length, 0);
});

test('hostile recorded text is shown as clipped plain text and only harmless element kinds are ever created', () => {
  const run = { format: 'X001-saved-run/1', id: 'hostile-text', kind: 'console', title: '<img src=x onerror=alert(1)>', source: { producer: '<b>x</b>', accepted: 7 }, producer: null, entries: [
    { type: 'connect' }, { type: 'event', id: '<img src=x onerror=alert(1)>\n'.repeat(20), event: '<script>alert(1)</script>', data: { step: '<b>', of: 1e99 } }, null, 7,
    { type: 'failure', failure: { code: '<script>' } }, { type: '<svg onload=alert(1)>' }, { type: 'open' }] };
  const page = loadPage({ saved: { schema: 'X001-saved/1', runs: [run] } });
  choose(page, 'hostile-text');
  assert.equal(page.position(), 1);
  assert.match(page.text('provenance'), /Source: <b>x<\/b> unknown\.$/);
  for (let i = 0; i < 6; i++) {
    page.click('next');
    assert.doesNotMatch(page.text('producing'), /[^\x20-\x7e]/);
    assert.ok(page.text('producing').length < 140);
    assert.equal(page.$('error').textContent, '');
  }
  assert.equal(page.$('entries').children.length, 7);
  assert.deepEqual([...new Set(page.document.created)].sort(), ['dd', 'dt', 'li', 'option', 'span']);
  assert.deepEqual([page.$('prev').disabled, page.$('next').disabled], [false, true]);
  assert.deepEqual(page.calls, []);
});

test('a sequence lookup moves to a recorded sequence and answers NOT_RECORDED, never the nearest state, for everything else', () => {
  const page = loadPage({ hash: '#run=c044-restart-gap&pos=1' });
  assert.deepEqual(['seq-find', 'seq-epoch', 'seq-number'].map((id) => page.$(id).disabled), [false, false, false]);
  const find = (epoch, sequence) => { page.$('seq-epoch').value = epoch; page.$('seq-number').value = sequence; page.click('seq-find'); return page.text('seq-result'); };
  const timeline = T.build(saved.runs[0]);
  let recorded = 0;
  for (const [epoch, sequence] of [1, 2].flatMap((e) => Array.from({ length: 24 }, (_, i) => [e, i + 1]))) {
    const answer = timeline.locate(epoch, sequence);
    const text = find(String(epoch), String(sequence));
    if (answer.ok) {
      recorded += 1;
      assert.equal(text, `Sequence ${sequence} of epoch ${epoch} is recorded at position ${answer.index + 1}.`);
      assertShown(page, 'c044-restart-gap', answer.index, `lookup ${epoch}:${sequence}`);
      assert.equal(page.$('state').descendants().find((node) => node.id === 'st-last').textContent, `synthetic-run-001:${epoch}:${sequence}`);
    } else {
      const before = page.position();
      assert.match(text, /^NOT_RECORDED: sequence \d+ of epoch \d+ /);
      assert.match(text, /No nearby state is shown instead\.$/);
      assert.equal(page.position(), before, 'a NOT_RECORDED lookup changes nothing');
    }
  }
  assert.equal(recorded, 25);
  assert.equal(find('1', '11'), 'NOT_RECORDED: sequence 11 of epoch 1 lies in a gap; sequences 10 to 12 were never recorded. No nearby state is shown instead.');
  for (const [epoch, sequence] of [['', ''], ['1', ''], ['0', '1'], ['1', '0'], ['-1', '1'], ['1', '1.5'], ['1e1', '1'], ['01', '1'], ['1', '1234567'], ['<b>', '1'], ['1', '%31'], ['1 1', '1'], ['9'.repeat(9), '1']]) {
    assert.match(find(epoch, sequence), /^SEQUENCE_INVALID: /, `${epoch}:${sequence}`);
  }
  assert.equal(find(' 1 ', ' 2 '), 'Sequence 2 of epoch 1 is recorded at position 4.');
  page.$('seq-number').dispatch('keydown', { key: 'Enter' });
  page.$('seq-epoch').dispatch('keydown', { key: 'a' });
  assert.equal(page.text('seq-result'), 'Sequence 2 of epoch 1 is recorded at position 4.');
  page.changeHash('#run=c034-closed-history&pos=3');
  assert.match(find('1', '1'), /^NOT_RECORDED: this recording is a client trace/);
  choose(page, 'c034-reordered');
  assert.deepEqual(['seq-find', 'seq-epoch', 'seq-number'].map((id) => page.$(id).disabled), [true, true, true]);
  assert.equal(page.text('seq-result'), '');
  page.click('seq-find');
  page.$('seq-number').dispatch('keydown', { key: 'Enter' });
  assert.equal(page.text('seq-result'), '');
});

test('the limits show right at the entry where they occur: the gap range and the epoch change are listed in the timeline itself', () => {
  const page = loadPage({ hash: '#run=c044-restart-gap&pos=1' });
  const notes = page.$('entries').children.map((item, index) => [index + 1, item.children[3].textContent]).filter(([, note]) => note !== '');
  assert.equal(notes.length, 2);
  assert.match(notes[0][1], /^GAP BEFORE: epoch 1 sequences 10 to 12 NOT RECORDED$/);
  assert.match(notes[1][1], /^EPOCH CHANGE 1 to 2$/);
  assert.equal(page.$('entries').children[notes[0][0] - 1].children[0].textContent, 'APPLIED');
  const closed = loadPage({ hash: '#run=c034-closed-history&pos=1' });
  assert.deepEqual(closed.$('entries').children.filter((item) => item.children[3].textContent !== ''), []);
});

test('a one-entry recording has no previous or next position and its scrub bar is at the start', () => {
  const one = { format: 'X001-saved-run/1', id: 'one', kind: 'console', title: 'one', source: null, producer: null, entries: [{ type: 'open' }] };
  const page = loadPage({ saved: { schema: 'X001-saved/1', runs: [one] }, hash: '#run=one&pos=1' });
  assert.deepEqual([page.$('prev').disabled, page.$('next').disabled, page.$('scrub-fill').style.width], [true, true, '0%']);
  page.key('ArrowRight');
  assert.match(page.text('error'), /requested position 2 /);
  assert.match(page.text('provenance'), /Source: unknown unknown\.$/);
});
