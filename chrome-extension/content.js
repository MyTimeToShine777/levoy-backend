// Turns a click on a tel: link into "dial it on my phone", and shows the result as a small toast.
(function () {
  function toast(text, ok) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:12px 16px;border-radius:10px;' +
      'font:14px system-ui,sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);background:' + (ok ? '#2b2c31' : '#d6341c') + ';border-left:4px solid ' + (ok ? '#fdbc00' : '#fff');
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  document.addEventListener('click', function (e) {
    const a = e.target && e.target.closest && e.target.closest('a[href^="tel:" i]');
    if (!a || e.defaultPrevented || e.button !== 0) return;
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'levoy-dial', number: a.getAttribute('href'), name: (a.textContent || '').trim().slice(0, 60) }, function (r) {
      if (chrome.runtime.lastError || !r) { toast('Levoy: could not reach the extension. Reload the page.', false); return; }
      toast(r.message, r.ok);
    });
  }, true);

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'levoy-toast') toast(msg.message, msg.ok);
  });
})();
