(function renderNewLocalFixture() {
  'use strict';
  const section = document.getElementById('preview-v2');
  const caption = section && section.querySelector('.rendered-caption');
  if (caption && document.currentScript
      && section.dataset.illustrationGeneration === document.currentScript.dataset.illustrationGeneration) {
    caption.textContent = 'Today shelf — v2';
    caption.dataset.assetVersion = 'v2';
  }
}());
