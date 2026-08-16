// auth pages (password match validation)

(function () {
  'use strict';

  function bind(formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var password = form.querySelector('#password');
    var confirm = form.querySelector('#confirm');
    var error = form.querySelector('#formError');
    if (!password || !confirm || !error) return;

    form.addEventListener('submit', function (e) {
      var msg = '';
      if (password.value.length < 6) {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (password.value !== confirm.value) {
        msg = 'Las contraseñas no coinciden.';
      }
      if (msg) {
        e.preventDefault();
        error.textContent = msg;
        error.classList.remove('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind('registerForm');
    bind('resetForm');
  });
})();
