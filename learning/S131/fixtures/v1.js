(function renderOldLocalFixture() {
  'use strict';
  const section = document.getElementById('preview-v1');
  const caption = section && section.querySelector('.rendered-caption');
  if (caption && document.currentScript
      && section.dataset.illustrationGeneration === document.currentScript.dataset.illustrationGeneration) {
    caption.textContent = 'Archive shelf — v1';
    caption.dataset.assetVersion = 'v1';
  }
}());
