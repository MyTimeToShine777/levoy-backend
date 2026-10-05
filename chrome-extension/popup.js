import { cleanNumber, devices, dial, normalizeServer, sendOtp, verifyOtp } from './shared.js';

const $ = id => document.getElementById(id);
const store = chrome.storage.local;

function show(view) { $('signin').hidden = view !== 'signin'; $('main').hidden = view !== 'main'; }
function say(id, text, cls) { const el = $(id); el.textContent = text; el.className = 'msg ' + (cls || ''); }

async function refreshPhones(session) {
  try {
    const list = await devices(fetch, session);
    $('phones').innerHTML = list.length
      ? list.map(d => `<div><span class="dot ${d.online ? 'on' : ''}"></span>${escapeHtml(d.device_name)} — ${d.online ? 'online' : 'offline'}</div>`).join('')
      : 'No phone linked yet. On the phone open Levoy → More → Linked Quick Call Extension.';
  } catch (e) { $('phones').textContent = ''; }
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function start() {
  const { server, token, email } = await store.get(['server', 'token', 'email']);
  if (!server || !token) { if (server) $('server').value = server; show('signin'); return; }
  $('who').textContent = email || '';
  show('main');
  refreshPhones({ server, token });
}

// Two steps: ask for a code (the server emails it), then submit it.
let codeStep = false;
let resendTimer = null;

function setCodeStep(on) {
  codeStep = on;
  $('step-email').hidden = on;
  $('step-code').hidden = !on;
  $('signin-btn').textContent = on ? 'Sign in' : 'Send code';
  $('signin-sub').textContent = on
    ? `Enter the 6-digit code sent to ${$('email').value.trim()}.`
    : 'Sign in with your Levoy account. Your phone dials; this only sends the number.';
  if (on) $('code').focus();
}

function startCooldown(seconds) {
  clearInterval(resendTimer);
  const btn = $('resend');
  let left = seconds;
  const paint = () => { btn.disabled = left > 0; btn.textContent = left > 0 ? `Resend code in ${left}s` : 'Resend code'; };
  paint();
  resendTimer = setInterval(() => { left -= 1; paint(); if (left <= 0) clearInterval(resendTimer); }, 1000);
}

async function requestCode() {
  const server = normalizeServer($('server').value);
  // the extension asks for access to this one server only, when the person signs in
  const origin = new URL(server).origin + '/*';
  if (!(await chrome.permissions.request({ origins: [origin] }))) throw new Error('Allow access to your server to continue.');
  const r = await sendOtp(fetch, server, $('email').value.trim());
  await store.set({ server });
  $('code').value = '';
  setCodeStep(true);
  startCooldown((r && r.resend_in) || 60);
}

async function verifyCode() {
  const { server } = await store.get('server');
  const r = await verifyOtp(fetch, server, $('email').value.trim(), $('code').value.trim());
  await store.set({ server, token: r.access_token, email: r.user.email });
  $('code').value = '';
  setCodeStep(false);
  clearInterval(resendTimer);
  await start();
}

$('signin-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('signin-btn').disabled = true; say('signin-msg', '');
  try {
    if (codeStep) await verifyCode(); else await requestCode();
  } catch (err) { say('signin-msg', err.message, 'err'); if (codeStep) $('code').value = ''; }
  finally { $('signin-btn').disabled = false; }
});

$('code').addEventListener('input', () => {
  $('code').value = $('code').value.replace(/\D/g, '').slice(0, 6);
  if ($('code').value.length === 6 && !$('signin-btn').disabled) $('signin-form').requestSubmit();
});

$('resend').addEventListener('click', async () => {
  say('signin-msg', '');
  try { await requestCode(); } catch (err) { say('signin-msg', err.message, 'err'); }
});

$('change-email').addEventListener('click', () => { clearInterval(resendTimer); say('signin-msg', ''); setCodeStep(false); });

$('dial-form').addEventListener('submit', async e => {
  e.preventDefault();
  const { server, token } = await store.get(['server', 'token']);
  if (!cleanNumber($('number').value)) { say('dial-msg', 'That does not look like a phone number.', 'err'); return; }
  $('dial-btn').disabled = true; say('dial-msg', '');
  try {
    await dial(fetch, { server, token }, $('number').value);
    say('dial-msg', 'Calling from your phone…', 'ok');
  } catch (err) {
    if (err.code === 401) { await store.remove('token'); await start(); return; }
    say('dial-msg', err.code === 402 ? `Quick Call is part of the ${err.plan || 'Premium'} plan.` : err.message, 'err');
  } finally { $('dial-btn').disabled = false; }
});

$('signout').addEventListener('click', async () => { await store.remove(['token', 'email']); await start(); });

start();
