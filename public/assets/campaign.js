// campaign page (gallery, donate toggle, share)

(function () {
  'use strict';

  function initGallery() {
    var main = document.getElementById('galleryMain');
    var thumbs = document.querySelectorAll('.gallery-thumb');
    if (!main || !thumbs.length) return;
    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        main.src = thumb.getAttribute('data-img');
        thumbs.forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');
      });
    });
  }

  function initDonateToggle() {
    var toggle = document.getElementById('donateToggle');
    var form = document.getElementById('donateForm');
    if (!toggle || !form) return;
    toggle.addEventListener('click', function () {
      form.hidden = !form.hidden;
      if (!form.hidden) {
        toggle.textContent = toggle.textContent; // keep label stable
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  function initShare() {
    var btn = document.getElementById('shareBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = window.location.href;
      var done = function () {
        var original = btn.textContent;
        btn.textContent = original;
        btn.style.opacity = '0.7';
        setTimeout(function () { btn.style.opacity = '1'; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url, done); });
      } else {
        fallbackCopy(url, done);
      }
    });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    done();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initGallery();
    initDonateToggle();
    initShare();
  });
})();
