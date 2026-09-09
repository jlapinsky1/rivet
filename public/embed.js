/**
 * Rivet Quote Request Embed
 *
 * Drop-in script for clients to embed a quote request form on their website.
 *
 * Usage (inline):
 *   <div id="rivet-quote"></div>
 *   <script src="https://myrivet.io/embed.js" data-business="mason-home-services"></script>
 *
 * Usage (popup button):
 *   <script src="https://myrivet.io/embed.js"
 *           data-business="mason-home-services"
 *           data-mode="popup"
 *           data-button-text="Request a Quote"
 *           data-button-color="#22c55e"></script>
 *
 * Attributes:
 *   data-business   (required) — business slug
 *   data-mode       — "inline" (default) or "popup"
 *   data-target     — CSS selector for inline container (default: "#rivet-quote")
 *   data-button-text — popup button label (default: "Request a Quote")
 *   data-button-color — popup button background color (default: "#22c55e")
 */
(function () {
  'use strict';

  // Find the script tag that loaded us
  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute('data-business');
  if (!slug) {
    console.error('[Rivet] Missing data-business attribute on embed script');
    return;
  }

  var mode = script.getAttribute('data-mode') || 'inline';
  var baseUrl = script.src.replace(/\/embed\.js(\?.*)?$/, '');
  var formUrl = baseUrl + '/request/' + encodeURIComponent(slug) + '?embed=1';

  // ─── Shared: Create iframe ───

  function createIframe(container) {
    var iframe = document.createElement('iframe');
    iframe.src = formUrl;
    iframe.style.cssText = 'width:100%;border:none;overflow:hidden;min-height:700px;border-radius:12px;';
    iframe.setAttribute('allow', 'camera;microphone');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'Request a Quote');
    container.appendChild(iframe);

    // Auto-resize from postMessage
    window.addEventListener('message', function (e) {
      if (e.source !== iframe.contentWindow) return;
      var data = e.data;
      if (data && data.type === 'rivet-resize' && typeof data.height === 'number') {
        iframe.style.height = data.height + 'px';
      }
      if (data && data.type === 'rivet-submitted') {
        iframe.style.height = '500px';
      }
      if (data && data.type === 'rivet-close' && mode === 'popup') {
        closePopup();
      }
    });

    return iframe;
  }

  // ─── Inline Mode ───

  if (mode === 'inline') {
    var targetSelector = script.getAttribute('data-target') || '#rivet-quote';
    // Wait for DOM ready, then mount
    function mountInline() {
      var target = document.querySelector(targetSelector);
      if (!target) {
        console.error('[Rivet] Container not found: ' + targetSelector);
        return;
      }
      createIframe(target);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountInline);
    } else {
      mountInline();
    }
    return;
  }

  // ─── Popup Mode ───

  var buttonText = script.getAttribute('data-button-text') || 'Request a Quote';
  var buttonColor = script.getAttribute('data-button-color') || '#22c55e';
  var overlay = null;
  var panel = null;

  function openPopup() {
    if (overlay) return;

    // Overlay
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity 0.2s ease;';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePopup();
    });

    // Panel
    panel = document.createElement('div');
    panel.style.cssText = 'background:#0a0f0d;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 25px 50px rgba(0,0,0,0.5);transform:translateY(20px);transition:transform 0.2s ease;';

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;z-index:10;background:none;border:none;color:#fff;font-size:28px;cursor:pointer;line-height:1;opacity:0.6;';
    closeBtn.addEventListener('click', closePopup);
    closeBtn.addEventListener('mouseenter', function () { closeBtn.style.opacity = '1'; });
    closeBtn.addEventListener('mouseleave', function () { closeBtn.style.opacity = '0.6'; });
    panel.appendChild(closeBtn);

    createIframe(panel);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    });
  }

  function closePopup() {
    if (!overlay) return;
    overlay.style.opacity = '0';
    panel.style.transform = 'translateY(20px)';
    document.body.style.overflow = '';
    setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      panel = null;
    }, 200);
  }

  // Escape key closes popup
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay) closePopup();
  });

  // Create the trigger button
  function mountButton() {
    var btn = document.createElement('button');
    btn.textContent = buttonText;
    btn.style.cssText = 'background:' + buttonColor + ';color:#fff;border:none;padding:14px 28px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity 0.15s ease;';
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '0.85'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '1'; });
    btn.addEventListener('click', openPopup);

    // Insert button after the script tag
    if (script.parentNode) {
      script.parentNode.insertBefore(btn, script.nextSibling);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
