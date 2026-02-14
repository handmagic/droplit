// ============================================
// DropLit Desktop Init v1.1
// Self-contained — does nothing on mobile
// Place in js/desktop-init.js
// ============================================

(function() {
  'use strict';

  // Detect desktop: explicit URL param, subdomain, or wide non-touch screen
  const params = new URLSearchParams(window.location.search);
  const isDesktop = 
    params.has('desktop') ||
    window.location.hostname === 'desktop.droplit.app' ||
    (window.innerWidth > 1024 && !('ontouchstart' in window) && !navigator.maxTouchPoints);

  if (!isDesktop) return; // ← Complete no-op on mobile

  console.log('[DropLit] Desktop mode detected');

  // 1. Load desktop CSS
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/desktop.css';
  document.head.appendChild(link);

  // 2. Mark for later use
  window.__DROPLIT_DESKTOP = true;

  // 3. On DOM ready: activate layout + auto-show ASKI
  document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('layout-desktop');
    console.log('[DropLit] Desktop layout activated');

    // Auto-show ASKI panel after a short delay (let other init finish first)
    setTimeout(function() {
      var panel = document.getElementById('askAIPanel');
      if (panel) {
        panel.style.display = 'flex';
        panel.classList.add('show');
        // Also set body class that mobile uses
        document.body.classList.add('chat-open');
      }
    }, 300);
  });

})();
