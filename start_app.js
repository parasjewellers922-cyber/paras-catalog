// Starts the web app.
//
// 1. Loads Firebase from this site's own copy (firebasejs/, saved there by
//    the build) instead of www.gstatic.com, so the app also opens on
//    computers or networks that block Google's file server (some
//    ad-blockers, antivirus and office Wi-Fi do). If the copy is missing,
//    the app falls back to loading it from Google as before.
// 2. Then loads flutter_bootstrap.js, which starts the app with the
//    graphics engine from this site too.
// 3. If the app hasn't started after 25 seconds, shows a Reload button that
//    clears the saved (cached) copy of the website first, plus the error.
(function () {
  var started = false;
  var errors = [];

  window.addEventListener('error', function (e) {
    errors.push(String((e && (e.message || (e.error && e.error.message))) || e));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    errors.push(String((r && (r.message || r)) || 'error'));
  });

  window.parasAppStarted = function () {
    started = true;
    var l = document.getElementById('loading');
    if (l) l.remove();
  };

  window.parasClearAndReload = async function () {
    try {
      if (navigator.serviceWorker) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
      if (window.caches) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }
    } catch (e) {}
    location.reload();
  };

  setTimeout(function () {
    if (started) return;
    var l = document.getElementById('loading');
    if (!l || l.querySelector('.stuck')) return;
    var box = document.createElement('div');
    box.className = 'stuck';
    box.innerHTML =
      'Taking too long to open.<br>Check the internet, then tap Reload.' +
      '<br><button type="button">Reload</button>';
    if (errors.length) {
      var s = document.createElement('small');
      s.textContent = 'Problem: ' + errors.slice(-2).join(' | ').slice(0, 300);
      box.appendChild(s);
    }
    box.querySelector('button').onclick = window.parasClearAndReload;
    l.appendChild(box);
  }, 25000);

  function loadBootstrap() {
    var s = document.createElement('script');
    s.src = 'flutter_bootstrap.js';
    s.async = true;
    document.body.appendChild(s);
  }

  // Dynamic import() keeps this file a plain script (older browsers just
  // skip to the fallback).
  var base = document.baseURI;
  function local(name) { return import(new URL('firebasejs/firebase-' + name + '.js', base).href); }
  Promise.all([local('app'), local('auth'), local('firestore'), local('storage')])
    .then(function (m) {
      // The names FlutterFire looks for; when firebase_core is set it
      // doesn't fetch anything from gstatic.com.
      window.firebase_core = m[0];
      window.firebase_auth = m[1];
      window.firebase_firestore = m[2];
      window.firebase_storage = m[3];
    })
    .catch(function (e) {
      console.warn('Local Firebase files not loaded, using Google:', e);
    })
    .then(loadBootstrap);
})();
