import { dial } from './shared.js';

const MENU = 'levoy-call';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU, title: 'Call "%s" with Levoy', contexts: ['selection', 'link'] });
});

async function session() {
  const { server, token } = await chrome.storage.local.get(['server', 'token']);
  return server && token ? { server, token } : null;
}

/** Ask the phone to dial. Resolves to { ok, message } — never throws, so callers can just show the message. */
export async function placeCall(number, name) {
  const s = await session();
  if (!s) return { ok: false, message: 'Sign in from the Levoy extension icon first.' };
  try {
    await dial(fetch, s, number, name);
    return { ok: true, message: 'Calling from your phone…' };
  } catch (e) {
    if (e.code === 401) await chrome.storage.local.remove('token');
    return { ok: false, message: e.code === 402 ? `Quick Call is part of the ${e.plan || 'Premium'} plan.` : e.code === 401 ? 'Your sign-in expired. Sign in again.' : e.message };
  }
}

function flash(tabId, ok) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#2e9e2e' : '#d6341c' });
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU) return;
  const text = info.linkUrl && /^tel:/i.test(info.linkUrl) ? info.linkUrl : info.selectionText;
  const r = await placeCall(text);
  flash(tab && tab.id, r.ok);
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'levoy-toast', ...r }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'levoy-dial') {
    placeCall(msg.number, msg.name).then(r => { flash(null, r.ok); sendResponse(r); });
    return true;   // async response
  }
  return false;
});
