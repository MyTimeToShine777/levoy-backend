// Talks to the Callio API. No chrome.* calls in here so it can be unit-tested with node.

/** "192.168.1.10:3001" / "https://crm.example.com/api/" → "https://crm.example.com/api" */
export function normalizeServer(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Enter your server address');
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '');
  if (!/\/api$/i.test(s)) s += '/api';
  return s;
}

/** "tel:+91 90000-11111" or "  (900) 001 1111 " → "+919000011111"; null if it is not a phone number. */
export function cleanNumber(raw) {
  const s = String(raw || '').replace(/^tel:/i, '').split(/[;?]/)[0].trim();
  const out = s.replace(/[^\d+]/g, '');
  const digits = out.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15 || /(?!^)\+/.test(out)) return null;
  return out;
}

async function request(fetchImpl, { server, token }, method, path, body) {
  let res;
  try {
    res = await fetchImpl(server + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error('Cannot reach the server. Check the address and your connection.');
    err.code = 0;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.detail) || `Request failed (${res.status})`);
    err.code = res.status;
    err.plan = data && data.required_plan_name;
    throw err;
  }
  return data;
}

// Sign-in is by a 6-digit code emailed to the user (no passwords).
export const sendOtp = (fetchImpl, server, email) =>
  request(fetchImpl, { server }, 'POST', '/auth/send-otp', { email });

export const verifyOtp = (fetchImpl, server, email, otp) =>
  request(fetchImpl, { server }, 'POST', '/auth/verify-otp', { email, otp });

export const devices = (fetchImpl, session) => request(fetchImpl, session, 'GET', '/quick-call/devices');

export async function dial(fetchImpl, session, rawNumber, name) {
  const number = cleanNumber(rawNumber);
  if (!number) throw new Error('That does not look like a phone number');
  return request(fetchImpl, session, 'POST', '/quick-call/dial', { number, name: name || undefined, source: 'chrome' });
}
