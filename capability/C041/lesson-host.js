(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./host-policy.js'));
  else Object.defineProperty(root, 'C041LessonHost', { value: factory(root.C041HostPolicy) });
}(globalThis, function (policy) {
  'use strict';

  function createHost({ mountPoint, status }) {
    if (!mountPoint || !status || mountPoint.ownerDocument !== status.ownerDocument) {
      throw new TypeError('A mount point and status from the same document are required.');
    }
    let frame = null;
    let selectedId = null;

    function unmount() {
      mountPoint.replaceChildren();
      frame = null;
      selectedId = null;
      status.textContent = 'No lesson selected. No result or management action has been run.';
    }

    function mount(id) {
      const selection = policy.resolveLesson(id);
      unmount();
      if (!selection.accepted) {
        status.textContent = 'Selection refused. Enter an exact approved delivered A lesson ID. Nothing is mounted.';
        return selection;
      }
      const document = mountPoint.ownerDocument;
      frame = document.createElement('iframe');
      frame.className = 'lesson-frame';
      frame.title = `${selection.id}: ${selection.title} — isolated synthetic training`;
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'");
      frame.setAttribute('tabindex', '0');
      frame.src = selection.entry;
      mountPoint.appendChild(frame);
      selectedId = selection.id;
      status.textContent = `${selection.id} selected. Isolated training frame requested; not a live Azure result. No lesson verdict is received or certified by this host.`;
      return selection;
    }

    function focusLesson() {
      if (!frame) return false;
      frame.focus();
      return true;
    }

    unmount();
    return Object.freeze({ mount, unmount, focusLesson, currentId: () => selectedId });
  }

  return Object.freeze({ createHost });
}));
