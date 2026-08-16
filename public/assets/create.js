// create/progress forms (image preview + validation)

(function () {
  'use strict';

  var ALLOWED = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  var MAX_BYTES = 1 * 1024 * 1024; // 1 MB per file
  var MAX_FILES = 10;

  function init() {
    var input = document.getElementById('images');
    if (!input) return;
    var previews = document.getElementById('imagePreviews');
    var hint = document.getElementById('imagesHint');

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      var valid = [];
      var problems = [];

      files.forEach(function (file) {
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ALLOWED.indexOf(ext) === -1) {
          problems.push(file.name + ': formato no permitido');
        } else if (file.size > MAX_BYTES) {
          problems.push(file.name + ': mayor a 1 MB');
        } else {
          valid.push(file);
        }
      });

      if (valid.length > MAX_FILES) {
        problems.push('Maximo ' + MAX_FILES + ' imagenes');
        valid = valid.slice(0, MAX_FILES);
      }

      // rebuild the file list with only valid files
      var dt = new DataTransfer();
      valid.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;

      previews.innerHTML = '';
      valid.forEach(function (file) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        previews.appendChild(img);
      });

      if (hint) {
        var parts = [];
        if (valid.length) parts.push(valid.length + ' imagen(es) seleccionada(s)');
        if (problems.length) parts.push(problems.join(', '));
        hint.textContent = parts.length ? parts.join('. ') : hint.getAttribute('data-default') || '';
        hint.style.color = problems.length ? 'var(--danger)' : 'var(--muted)';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
