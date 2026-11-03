(function () {
  'use strict';
  const element = id => document.getElementById(id);
  const picker = element('lesson-id');
  const enter = element('enter-lesson');
  const clear = element('unmount-lesson');
  const host = globalThis.C041LessonHost.createHost({
    mountPoint: element('lesson-mount'),
    status: element('selection-status')
  });

  for (const lesson of globalThis.C041HostPolicy.listLessons()) {
    const option = document.createElement('option');
    option.value = lesson.id;
    option.textContent = lesson.title;
    element('delivered-ids').appendChild(option);
    const item = document.createElement('li');
    item.textContent = `${lesson.id} — ${lesson.title} (controller-accepted synthetic A lesson)`;
    element('approved-lessons').appendChild(item);
  }
  element('catalog-source').textContent = `Read-only accepted ledger snapshot, revision ${
    globalThis.C041AcceptedCatalog.source.revision
  }, captured ${globalThis.C041AcceptedCatalog.capturedAtUtc}. Not a live acceptance or revocation feed.`;

  element('lesson-picker').addEventListener('submit', event => {
    event.preventDefault();
    const selection = host.mount(picker.value);
    enter.disabled = !selection.accepted;
    clear.disabled = !selection.accepted;
  });
  enter.addEventListener('click', () => host.focusLesson());
  clear.addEventListener('click', () => {
    host.unmount();
    enter.disabled = true;
    clear.disabled = true;
    picker.focus();
  });
  element('return-to-picker').addEventListener('click', () => picker.focus());
}());
