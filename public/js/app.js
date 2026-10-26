// MediTrack - JavaScript côté navigateur (fichier externe : aucun script inline, compatible CSP)
(function () {
  'use strict';

  // --- Toasts (messages de succès / d'erreur) ---
  function showToast(message, type) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type === 'error' ? 'error' : 'success');
    t.textContent = message;
    region.appendChild(t);
    setTimeout(function () { t.classList.add('toast-out'); setTimeout(function () { t.remove(); }, 300); }, 4000);
  }
  var flash = document.getElementById('flash');
  if (flash) {
    showToast(flash.dataset.message, flash.dataset.type);
    var url = new URL(window.location.href); // nettoie l'URL (?toast=...)
    url.searchParams.delete('toast'); url.searchParams.delete('type');
    history.replaceState(null, '', url.pathname + url.search);
  }

  // --- Validation visible des formulaires ---
  function errorBox(input) { return document.querySelector('[data-error-for="' + input.id + '"]'); }
  document.addEventListener('invalid', function (e) {
    var f = e.target; f.classList.add('touched');
    var box = errorBox(f); if (box) box.textContent = f.validationMessage;
  }, true);
  function checkMatch(input) { // champs "confirmer le mot de passe"
    var other = document.getElementById(input.dataset.match);
    input.setCustomValidity(other && input.value !== other.value ? 'Les mots de passe ne correspondent pas.' : '');
  }
  document.addEventListener('input', function (e) {
    var f = e.target;
    if (f.dataset && f.dataset.match) checkMatch(f);
    if (f.id === 'password') { var c = document.getElementById('confirm'); if (c && c.value) checkMatch(c); }
    if (f.classList && f.classList.contains('touched')) {
      var box = errorBox(f);
      if (f.checkValidity()) { f.classList.remove('touched'); if (box) box.textContent = ''; }
      else if (box) box.textContent = f.validationMessage;
    }
  });

  // --- Soumission : confirmation + indicateur de chargement ---
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) { e.preventDefault(); return; }
    setTimeout(function () {
      if (e.defaultPrevented) return;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); }
    }, 0);
  });
  window.addEventListener('pageshow', function () { // retour arrière du navigateur
    document.querySelectorAll('.is-loading').forEach(function (b) { b.classList.remove('is-loading'); b.removeAttribute('aria-busy'); });
  });

  // --- Réservation : affiche les créneaux du jour choisi ---
  var booking = document.querySelector('.booking');
  if (booking) {
    var groups = booking.querySelectorAll('[data-slots-for]');
    var syncDay = function () {
      var sel = booking.querySelector('input[name="date"]:checked');
      groups.forEach(function (g) { g.hidden = !sel || g.dataset.slotsFor !== sel.value; });
    };
    booking.querySelectorAll('input[name="date"]').forEach(function (i) {
      i.addEventListener('change', function () {
        booking.querySelectorAll('input[name="heure"]').forEach(function (h) { h.checked = false; });
        document.getElementById('slot-error').textContent = '';
        syncDay();
      });
    });
    syncDay();
    booking.addEventListener('submit', function (e) {
      if (!booking.querySelector('input[name="heure"]:checked')) {
        e.preventDefault();
        document.getElementById('slot-error').textContent = 'Veuillez choisir une heure.';
      }
    });
  }

  // --- Impression de la fiche médicale (sans script inline) ---
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="print"]');
    if (btn) {
      e.preventDefault();
      window.print();
    }
  });
})();

