// MediTrack – Popup d'authentification (connexion / inscription)
// Fichier externe – aucun script inline, compatible CSP strict
(function () {
  'use strict';

  var overlay  = document.getElementById('auth-modal');
  var dialog   = document.getElementById('auth-dialog');
  var closeBtn = document.getElementById('modal-close-btn');
  var tabLogin = document.getElementById('tab-login');
  var tabReg   = document.getElementById('tab-register');
  var panLogin = document.getElementById('panel-login');
  var panReg   = document.getElementById('panel-register');
  var switchLink = document.getElementById('switch-tab-link');
  var modalTitle = document.getElementById('auth-modal-title');

  if (!overlay) return; // page non concernée

  // ---- Ouvrir / fermer ----
  function openModal(tab) {
    overlay.removeAttribute('hidden');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    switchToTab(tab || 'login');
    // Focus piégé : premier champ du panneau actif
    var firstInput = dialog.querySelector('.modal-panel.active input');
    if (firstInput) setTimeout(function() { firstInput.focus(); }, 100);
  }

  function closeModal() {
    overlay.classList.remove('open');
    setTimeout(function () {
      overlay.setAttribute('hidden', '');
      document.body.style.overflow = '';
    }, 250);
  }

  function switchToTab(tab) {
    if (tab === 'register') {
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
      tabReg.classList.add('active');
      tabReg.setAttribute('aria-selected', 'true');
      panLogin.classList.remove('active');
      panLogin.setAttribute('hidden', '');
      panReg.classList.add('active');
      panReg.removeAttribute('hidden');
      modalTitle.textContent = 'Inscription';
      switchLink.textContent = 'Déjà inscrit ? Se connecter';
    } else {
      tabReg.classList.remove('active');
      tabReg.setAttribute('aria-selected', 'false');
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      panReg.classList.remove('active');
      panReg.setAttribute('hidden', '');
      panLogin.classList.add('active');
      panLogin.removeAttribute('hidden');
      modalTitle.textContent = 'Connexion';
      switchLink.textContent = 'Pas encore inscrit ? Créer un compte';
    }
  }

  // Boutons déclencheurs
  document.querySelectorAll('[data-modal-trigger="auth"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(btn.dataset.tab);
    });
  });

  // Fermeture
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hasAttribute('hidden')) closeModal();
  });

  // Onglets
  tabLogin.addEventListener('click', function () { switchToTab('login'); });
  tabReg.addEventListener('click',   function () { switchToTab('register'); });
  switchLink.addEventListener('click', function (e) {
    e.preventDefault();
    switchToTab(panLogin.classList.contains('active') ? 'register' : 'login');
  });

  // Focus trap
  dialog.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var focusables = dialog.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var arr = Array.from(focusables).filter(function (el) { return !el.hidden && !el.closest('[hidden]') && !el.disabled; });
    if (!arr.length) return;
    var first = arr[0], last = arr[arr.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  });

  // ---- Affichage des erreurs ----
  function showError(containerId, message) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = message;
    el.removeAttribute('hidden');
  }
  function hideError(containerId) {
    var el = document.getElementById(containerId);
    if (el) { el.textContent = ''; el.setAttribute('hidden', ''); }
  }

  // ---- Formulaire Connexion ----
  var loginForm = document.getElementById('login-form');
  var loginBtn  = document.getElementById('login-btn');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError('login-error');
      var email    = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;
      loginBtn.classList.add('is-loading');
      loginBtn.setAttribute('aria-busy', 'true');

      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
        credentials: 'same-origin'
      })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        loginBtn.classList.remove('is-loading');
        loginBtn.removeAttribute('aria-busy');
        if (res.ok && res.data.role) {
          window.location.href = res.data.role === 'medecin' ? '/medecin' : '/accueil';
        } else {
          showError('login-error', res.data.error || 'E-mail ou mot de passe incorrect.');
        }
      })
      .catch(function () {
        loginBtn.classList.remove('is-loading');
        loginBtn.removeAttribute('aria-busy');
        showError('login-error', 'Erreur réseau, veuillez réessayer.');
      });
    });
  }

  // ---- Formulaire Inscription ----
  var regForm = document.getElementById('register-form');
  var regBtn  = document.getElementById('register-btn');
  if (regForm) {
    regForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError('register-error');
      var nom      = document.getElementById('reg-name').value.trim();
      var email    = document.getElementById('reg-email').value.trim();
      var password = document.getElementById('reg-password').value;
      var confirm  = document.getElementById('reg-confirm').value;

      if (password !== confirm) {
        showError('register-error', 'Les mots de passe ne correspondent pas.');
        return;
      }

      regBtn.classList.add('is-loading');
      regBtn.setAttribute('aria-busy', 'true');

      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom, email: email, password: password, confirm: confirm }),
        credentials: 'same-origin'
      })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        regBtn.classList.remove('is-loading');
        regBtn.removeAttribute('aria-busy');
        if (res.ok && res.data.role) {
          window.location.href = res.data.role === 'medecin' ? '/medecin' : '/accueil';
        } else {
          var msgs = Array.isArray(res.data.errors) ? res.data.errors.join(' ') : (res.data.error || 'Erreur lors de l\'inscription.');
          showError('register-error', msgs);
        }
      })
      .catch(function () {
        regBtn.classList.remove('is-loading');
        regBtn.removeAttribute('aria-busy');
        showError('register-error', 'Erreur réseau, veuillez réessayer.');
      });
    });
  }

  // ---- Formulaire Contact (fictif) ----
  var contactBtn = document.getElementById('contact-submit');
  if (contactBtn) {
    contactBtn.addEventListener('click', function () {
      contactBtn.classList.add('is-loading');
      setTimeout(function () {
        contactBtn.classList.remove('is-loading');
        // Toast succès via showToast si disponible
        var region = document.getElementById('toast-region');
        if (region) {
          var t = document.createElement('div');
          t.className = 'toast toast-success';
          t.textContent = 'Message envoyé ! Nous vous répondrons sous 24h.';
          region.appendChild(t);
          setTimeout(function () { t.classList.add('toast-out'); setTimeout(function () { t.remove(); }, 300); }, 4000);
        }
        document.getElementById('contact-form').reset();
      }, 1200);
    });
  }

  // ---- Burger menu mobile ----
  var burgerBtn  = document.getElementById('burger-btn');
  var mobileMenu = document.getElementById('mobile-menu');
  if (burgerBtn && mobileMenu) {
    burgerBtn.addEventListener('click', function () {
      var isOpen = burgerBtn.classList.toggle('open');
      burgerBtn.setAttribute('aria-expanded', isOpen);
      if (isOpen) { mobileMenu.removeAttribute('hidden'); }
      else         { mobileMenu.setAttribute('hidden', ''); }
    });
  }

})();
