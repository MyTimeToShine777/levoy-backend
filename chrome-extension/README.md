# Callio Quick Call — Chrome extension

Click a phone number on any web page and **your own phone** dials it. The extension only sends the number to your
Callio server; the phone (signed in to the same account, with Quick Call switched on) places the call.

Needs the **Premium** plan on the workspace. Without it the server answers 402 and the extension says so.

## Install (developer mode)

1. Chrome → `chrome://extensions` → switch on **Developer mode** → **Load unpacked** → choose this folder.
2. Click the extension icon. Enter your server (e.g. `192.168.1.10:3001`), your email, then the 6-digit code we email you (there is no password). Chrome asks to allow
   access to that one server — that is the only site the extension talks to.
3. On the phone: Callio → More → **Linked Quick Call Extension** → switch on, and allow calling.

## Use

- Click any `tel:` link → the phone dials; a small toast shows the result.
- Select a number on a page → right-click → **Call "…" with Callio**.
- Or open the extension popup and type a number.

The phone must be online (the toolbar popup lists your linked phones and whether each is online). A dial request that the phone has
not picked up within two minutes is discarded, so a forgotten request never dials later.

## Develop

`shared.js` holds all server calls and number cleaning (no `chrome.*`), tested with `node --test test/shared.test.mjs`.
`background.js` (context menu + dial), `content.js` (tel: clicks + toast), `popup.*` (sign in, dial, linked phones).
The content script runs on all http(s) pages so it can see `tel:` links; it only reads the link you click.
